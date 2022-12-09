#!/bin/python3
import flask, flask_login
from flask import url_for, request, render_template, redirect, send_from_directory
from flask_login import current_user
import json, random, hashlib, functools, string, re
from datetime import datetime
from db import DBDict, db_dicts

PREFIX="/doodlerpg"
app = flask.Flask(__name__,
    static_url_path = PREFIX + "/static"
)

app.secret_key = "nonsmoker thickheaded whist surely mushrooms" # Hack-a-day! Check it in to source.
login_manager = flask_login.LoginManager()
login_manager.init_app(app)

# --- Users and login ---
users = DBDict("users")
class User(flask_login.UserMixin):
    def get(username, password=None):
        if username == '' or username not in users:
            return
        if password is not None and users[username]['password'] != password:
            return
        user = User()
        user.id = username
        return user
    def register(username, password):
        # TODO: Prevent name collision with existing game object
        # TODO: 'normal' characters only
        # TODO: Allow editing your artwork
        # TODO: Salt and hash passwords
        if username in users:
            if password == users[username]['password']:
                return user
            return None
        users[username]={'password': password}
        return User.get(username, password)

@app.route(PREFIX+"/login", methods=['POST'])
def login():
    username = flask.request.form['username']
    password = flask.request.form['password']
    user = User.get(username, password)
    if not user: # Hack-a-day! Combine registration and login
        user = User.register(username, password)
    if user:
        flask_login.login_user(user, remember=True)
        return flask.redirect(url_for("index"))
    return 'Bad login'

@app.route(PREFIX+'/logout')
def logout():
    flask_login.logout_user()
    redirect = flask.request.args.get('redirect', flask.url_for("index"))
    return flask.redirect(redirect)

@login_manager.user_loader
def user_loader(username): # Load user from a session
    return User.get(username)

@app.route(PREFIX+"/login.js")
def login_js():
    if current_user.is_authenticated:
        return "window.loggedIn = true;\nwindow.userId = \"{}\";".format(current_user.id)
    else:
        return "window.loggedIn = false;\nwindow.userId = \"\";"

# -- Index page
@app.route(PREFIX+"/")
def index():
    return send_from_directory('static', "index.html")

# -- Ajax helper ---
class UserError(Exception):
    def __init__(self, reason):
        self.error = reason
def ajax(route):
    def x(f, r=route):
        @functools.wraps(f)
        def f2(*a, **kw):
            if not flask.request.is_json:
                return "Invalid JSON", 400
            query = flask.request.get_json()
            if app.config["DEBUG"]:
                # Add realistic delay
                import time
                #time.sleep(0.5)
            try:
                r = f(query, *a, **kw)
                r["success"] = True
                return r
            except UserError as e:
                return { "success": False, "error": e.error }, 200
        return app.route(r, methods=["POST"])(app.route(PREFIX+r, methods=["POST"])(f2))
    return x
app.ajax = ajax


# --- Game ---
objects = DBDict("object")
ALLOWED_PUNCTUATION = "-'\"!@#$%&*()=|;:,.?/" # Keep - at the beginning for regex
name_regex = re.compile(r"[{}a-zA-Z0-9 ]{{1,100}}".format(ALLOWED_PUNCTUATION))

class InvalidMove(UserError): pass
class InvalidGet(UserError): pass
class InvalidCreate(UserError): pass

def add_to(placeId, thingId):
    place = objects.get(placeId)
    if not place:
        raise InvalidMove("Thing moved to place that doesn't exist")
    if "contents" not in place:
        place["contents"] = []
    if thingId not in place["contents"]:
        place["contents"].append(thingId)
    objects[placeId] = place
def remove_from(placeId, thingId):
    place = objects.get(placeId)
    if not place:
        raise InvalidMove("Thing removed from place that doesn't exist")
    if thingId in place["contents"]:
        place["contents"].remove(thingId)
        objects[placeId] = place
    else:
        #raise InvalidMove("Thing removed from place, but it's not in the place")
        pass
def move(thingId, toPlaceId):
    thing = objects.get(thingId)
    if not thing:
        raise InvalidMove("Tried to move a thing that doesn't exist")

    remove_from(thing["placeId"], thingId)
    add_to(toPlaceId, thingId)
    thing["placeId"] = toPlaceId
    thing["updateTime"] = datetime.now()
    objects[thingId] = thing # Save object
    return thing

@app.ajax("/create")
def create_ajax(thing):
    thingId = thing["id"]
    name = thing["name"]
    placeId = thing.get("placeId", None)
    if placeId:
        place = objects.get(placeId)
        # No fullness check on server
        if not place:
            raise InvalidCreate("Thing created in place that doesn't exist")
    elif thing["type"] != "place":
        raise InvalidCreate("Thing needs a place")

    if len(thing["type"].split()) != 1:
        raise InvalidCreate("Invalid type")
    if thingId != "{} {}".format(thing["type"], thing["name"]):
        raise InvalidCreate("Id should be type + name")
    if objects.get(thingId) is not None:
        raise InvalidCreate("Somewhere in the Doodle-verse, something already has that name. Please come up with an original name.")
    if not name_regex.match(thingId):
        raise InvalidCreate("Please only use english letters, numbers, spaces, and basic punctuation in names.")

    thing["creator"] = current_user.id
    thing["creationTime"] = datetime.now()
    thing["updateTime"] = datetime.now()

    objects[thingId] = thing

    if placeId:
        add_to(placeId, thingId)

    return {"key": thingId, "thing": thing}

@app.ajax("/move")
def move_ajax(j):
    key = j["thingId"]
    to_loc = j["toPlaceId"]
    thing = move(key, to_loc)
    return {"key": key, "value": thing}

@app.ajax("/art")
def art_ajax(json):
    thingId = json["thingId"]
    thing = objects.get(thingId)
    if thing is None:
        raise InvalidGet("Thing does not exist")
    return {"thingId": thingId, "pictureUrl":thing["pictureUrl"]}

@app.ajax("/get")
def get_ajax(json):
    thingId = json["thingId"]
    thing = objects.get(thingId)
    if thing is not None:
        del thing["pictureUrl"]
        for x in ["maxContentsSize", "actions"]:
            if x in thing: del thing[x]
    return {"thingId": thingId, "thing":thing}

@app.ajax("/things")
def getAllThings(json):
    return {"ids": list(objects.keys())}
@app.ajax("/things/<type>")
def getAllPlaces(json, type):
    return {"ids": [k for k in objects.keys() if k.startswith(type + " ")]}

@app.route(PREFIX+"/dump")
def dump():
    global db_dicts
    s = "<pre>"
    s+="DICTS = {}\n".format(repr(sorted(db_dicts)))
    for d in sorted(db_dicts):
        if d=="users" and not (app.config["DEBUG"] or current_user.id == "zachary"):
            continue
        db = DBDict(d, debug=True)
        replacements = {
            "password": lambda x: "XXX",
            "pictureUrl": lambda x: x[:21]+"...",
        }
        identity = lambda x: x

        s+="{}={{\n{}\n}}\n".format(d, "\n".join("  {}: {}".format(repr(k),repr({a: replacements.get(a, identity)(b) for a,b in v.items()})) for k,v in db.items()))
    s+="</pre>"
    return s
