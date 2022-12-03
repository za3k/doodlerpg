#!/bin/python3
import flask, flask_login
from flask import url_for, request, render_template, redirect, send_from_directory
from flask_login import current_user
import json, random, hashlib, functools, string
from db import DBDict

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
        return "window.loggedIn = false;\nwindow.userId = "";"

# -- Index page
@app.route(PREFIX+"/")
def index():
    print(url_for('static', filename='style.css'))
    return send_from_directory('static', "index.html")

# -- Ajax helper ---
def ajax(route):
    def x(f, r=route):
        @functools.wraps(f)
        def f2(*a, **kw):
            if not flask.request.is_json:
                return "Invalid JSON", 400
            query = flask.request.get_json()
            return f(query, *a, **kw)
        #print(r)
        return app.route(r, methods=["POST"])(app.route(PREFIX+r, methods=["POST"])(f2))
    return x
app.ajax = ajax

# --- Game ---
objects = DBDict("object")

@app.ajax("/store")
def store(j):
    # TODO: 'normal' characters only
    # TODO: separate movement from creation
    key = j["id"]
    value = j
    objects[key] = value
    return {"key":key, "value": value}

@app.ajax("/get")
def get(json):
    # TODO: Separate art to reduce network traffic, since art doesn't change.
    key = json["key"]
    value = objects.get(key)
    return {"key": key, "value":value}

@app.ajax("/getAllIds")
def getAllIds(json):
    # TODO: Just getAllPlaces instead
    return {"keys": list(objects.keys())}
