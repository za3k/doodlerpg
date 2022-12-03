from sqlitedict import SqliteDict

db_lists = set()
db_dicts = set()
def DBDict(name, is_list=False, debug=False):
    if not (is_list or debug):
        global dicts
        db_dicts.add(name)
    return SqliteDict("app.sqlite",tablename=name,autocommit=True)
class DBList():
    def __init__(self, name, debug=False):
        if not debug:
            global db_lists
            db_lists.add(name)
        self.d = DBDict(name, is_list=True)
        if "order" not in self.d:
            self.d["order"] = []
    def append(self, x):
        import time
        key = str(int(time.time())) # Good enough for hack-a-day
        self.d[key] = x
        self.d["order"] = self.d["order"] + [key]
    def __len__(self):
        return len(self.d["order"])
    def __getitem__(self, key):
        key = self.d["order"][key]
        return self.d[key]
    def __setitem__(self, key, value):
        key = self.d["order"][key]
        self.d[key] = value
    def __iter__(self):
        return (self.d[key] for key in self.d["order"])
    def __reversed__(self):
        return (self.d[key] for key in reversed(self.d["order"]))

# --- We might need these helpers later ---
def random_id():
    LETTERS=string.ascii_letters + string.digits
    return "".join(random.choice(LETTERS) for letter in range(10))
def hash_id(data):
    if isinstance(data, str): data = data.encode("utf8")
    return hashlib.sha256(data).hexdigest()
