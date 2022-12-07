'use strict';

// TODO: Remove bootstrap vibes at top
// TODO: Name checks, room fullness checks should be on client to fail faster

const VERSIONS = [
    { number: 1, message: "New this update: <ol><li>play on your phone</li><li>'move' shows where to</li></ol> New last update: <ol><li>you can report bugs</li><li>afk players are hidden</li><li>things are sorted</li></ol>" }
]
const VERSION = VERSIONS[VERSIONS.length-1];

function scroll() { window.scrollTo(0, document.body.scrollHeight); }
function debug(e) {
    $(".error").text(e || "");
    scroll();
}
function deepcopy(o) { return JSON.parse(JSON.stringify(o)); }
function lexicalSort(a, b, key_func) {
    const a_key = key_func(a);
    const b_key = key_func(b);
    for (let i=0; i<a_key.length; i++) {
        if (a_key[i] < b_key[i]) return -1;
        else if (a_key[i] > b_key[i]) return 1;
    }
    return 0;
}

const PRESETS = {
    place: {
        contents: [],
        maxContentsSize: 50,
    },
    door: {
        actions: {"move": "movePlayer"},
    },
    person: {
        maxContentsSize: 50,
        placeId: "place the first room"
    },
    scenery: { }
}

function splitId(id) {
    const s = id.indexOf(' ');
    const type = id.substring(0, s);
    const name = id.substring(s+1);
    return {type, name};
}

class Set {
    constructor() { this.l = {}; }
    add(x) { this.l[x] = 1; }
    get list() { return Object.keys(this.l); }
}
class Backend {
    lists = {}
    artCache = {}
    constructor() {
        // Load all keys on game start
        this.ajax("/things", {}).then(r => r.ids.forEach(this.see.bind(this)));
    }
    getList(type) { return this.lists[type] = this.lists[type] || new Set(); }
    async ajax(url, data) {
        return new Promise(success => {
            $.ajax({
                url: `/doodlerpg${url}`,
                method: "POST",
                data: JSON.stringify(data),
                dataType: 'json',
                contentType: 'application/json',
                success: (r) => {
                    if (r.success) success(r);
                    else debug(r.error);
                }
            });
        })
    }
    listAll(type) { return this.lists[type].list }
    see(id) {
        const type = splitId(id).type;
        this.getList(type).add(id);
    }
    async move(thingId, toPlaceId) {
        await this.ajax("/move", { thingId, toPlaceId });
    }
    async create(thing) {
        this.see(thing.id);
        await this.ajax("/create", thing);
    }
    async get(thingId) {
        this.see(thingId);
        const thing = (await this.ajax("/get", {thingId})).thing;
        if (!thing) return thing;
        thing.pictureUrl = (this.artCache[thingId] = this.artCache[thingId] || (await this.ajax("/art", {thingId})).pictureUrl);

        thing.creationTime = new Date(thing.creationTime || thing.creation_time || 0);
        thing.updateTime = new Date(thing.updateTime || thing.creationTime || thing.creation_time || 0);
        const now = new Date();
        const daysSinceUpdate = (now - thing.updateTime)/1000.0/3600/24;
        thing.afk = (thing.type == "person" && daysSinceUpdate > 1);
        if (thing.afk) thing.type = "afk";
        return thing;
    }
}

class UI {
    constructor(div, game) {
        this.div = div;
        this.game = game;
        this.marker = $(div.find(".craft")[0]);
        this.place = div.find(".place-container");
        this.things = div.find(".thing-container");
        this.crafting = div.find(".craft");
        this.mentions = div.find(".mentions");
        this.afk = div.find(".afk-container");
        this.motd = $(document).find(".motd");
        const easel = new Easel(div.find(".easel"));
        const chooser = new Chooser(div.find(".chooser"));

        // Prompt methods
        this.choice = chooser.choose.bind(chooser);
        this.makeImage = easel.makeImage.bind(easel);
        this.draw = easel.draw.bind(easel);
    }
    add(e) {
        this.marker.before(e);
    }

    // UI methods
    async displayPlace(place) {
        this.place.html(await this.thingCard(place));
    }
    async displayThing(thing) {
        const e = await this.thingCard(thing);
        if (thing.afk) {
            e.css("--order", this.afk.children().length);
            this.afk.append(e);
        } else this.marker.before(e);
        //scroll();
    }
    async displayCrafting() {
        this.crafting.removeClass("hidden");
    }
    displayMotd(motd) {
        this.motd.html(motd);
    }

    mention(text) {
        this.mentions.append(this.mentionCard(text));
    }
    clearMentions() {
        this.mentions.children().remove();
    }
    clear() {
        this.crafting.addClass("hidden");
        this.mentions.children().remove();
        this.afk.children().remove();
        this.things.find(".thing").remove();
        this.place.children().remove();
    }

    // Template filler methods
    mentionCard(text) {
        return $(`<span class="mention">${text}</span>`);
    }
    async thingCard(thing) {
        // Make the base card
        const card = $(`<div class="thing card ${thing.type}"><div class="type">${thing.type}</div><canvas class="thing-image"></canvas><div class="name">${thing.name}</div><div class="actions"></div></div>`);

        // Draw the picture
        const image = await this.makeImage(thing.pictureUrl);
        const canvas = card.find("canvas");
        const context = canvas[0].getContext("2d");
        canvas[0].width = canvas[0].height = 200;
        context.drawImage(image, 0, 0, canvas[0].width, canvas[0].height)

        // Add and bind action buttons
        const actions = card.find(".actions");
        for (let [name, action] of Object.entries(thing.actions||{})) {
            if (name == "move") {
                const to = splitId(thing.targetId).name;
                name = `move (${to})`;
            }
            const actionE = $(`<input type="submit" class="action" value="${name}" />`);
            actionE.on("click", () => { this.game.onAction(thing, action); });
            actions.append(actionE);
        }
        return card;
    }
}

class Game {
    constructor(div) {
        this.backend = new Backend();
        this.ui = new UI(div, this);

        // Wait for actions, then do stuff. All async.
        this.craftBtn = div.find(".craft input");
        for (let type of ["door", "scenery"]) {
            div.find(`.craft-${type}`).on("click", () => this.craft({type}))
        }
    }

    async craft(thing = {}) {
        this.craftBtn.hide();
        if (!thing.type) thing.type = await this.ui.choice("I want to make a new:", ["scenery", "door"], false);
        else this.ui.mention(`You are making a new ${thing.type}.`);
        thing = {
            ...deepcopy(PRESETS[thing.type]),
            ...thing,
        }
        if (!thing.name) thing.name = await this.ui.choice(`I'm making a ${thing.type} named:`, [], true)
        else this.ui.mention(`Your ${thing.type} is named ${thing.name}`);
        thing.id = `${thing.type} ${thing.name}`;

        if (thing.type == "door") {
            if (!thing.targetId) {
                const targetName = await this.ui.choice(`When someone goes through ${thing.name}, they should end up in: `, this.backend.listAll("place").map((id) => splitId(id).name), true);
                thing.targetId = `place ${targetName}`
            } else this.ui.mention(`When someone goes from ${thing.name}, they will end up in ${thing.targetId}`);
        }
        thing.pictureUrl = await this.ui.draw(thing.name);

        if (thing.type != "place" && !thing.placeId) thing.placeId = this.player.placeId;

        await this.backend.create(thing); // data update
        this.created(thing, thing.placeId); // visual update. no 'await' deliberately
            
        this.ui.clearMentions();
        this.craftBtn.show();
        return thing;
    }
    async created(thing) { // Visual update
        const placeId = thing.placeId;
        if (thing.type == "place") return;

        // Display new objects locally immediately. Everyone else has to leave and come back
        if (!this.player || thing == this.player) {} // Part of making the player at the beginning, ignore
        else if (this.player.placeId == placeId) await this.ui.displayThing(thing);
    }

    async craftMissing(id) {
        return await this.craft(splitId(id)); // name, type
    }
    async playerMove(placeId) {
        this.place = (await this.backend.get(placeId)) || (await this.craftMissing(placeId));
        await this.backend.move(this.player.id, placeId);
        this.player = await this.backend.get(this.player.id);
        this.playerArrived();
    }
    async playerArrived() {
        this.ui.clear();
        await this.ui.displayPlace(this.place);

        const things = [];
        for (let thingPromise of this.place.contents.map(this.backend.get.bind(this.backend))) {
            // Load each one in order, but requests go in parallel.
            const thing = await thingPromise;
            if (thing) things.push(thing);
            else debug("Thing is here but not created");
        }
        const TYPE_ORDER = ["place", "person", "scenery", "door", "afk"]
        things.sort((a,b) => lexicalSort(a, b, x => [TYPE_ORDER.indexOf(x.type), new Date(x.creationTime), x.name]));
        for (let thing of things) await this.ui.displayThing(thing);
        this.ui.displayCrafting();
    }
    async onAction(thing, action) {
        if (action == "movePlayer") this.playerMove(thing.targetId);
    }
    checkNewVersion() {
        const lastVersion = localStorage.getItem("version") || 0;
        if (!window.location.href.includes("localhost"))
            localStorage.setItem("version", VERSION.number);
        if (lastVersion < VERSION.number) this.ui.displayMotd(VERSION.message)
    }
    async run() {
        this.checkNewVersion();
        const yourId = `person ${window.userId}`;
        const firstRoomId = PRESETS.person.placeId;
        //const firstRoom = await this.backend.get(firstRoomId) || await this.craft({type: "place", name: splitId(firstRoomId).name}); // Needed for the very first player only.
        this.player = await this.backend.get(yourId) || await this.craft({type: "person", placeId: firstRoomId, name: window.userId});
        this.place = await this.backend.get(this.player.placeId) || await this.craftMissing(this.player.placeId);
        this.playerArrived();
    }
}

function mainLoggedIn() {
    $(".logged-in").toggle(true);
    $(".logged-out").toggle(false);
    $(".my-username").text(window.userId);
    let game = window.game = new Game($(".game"));
    game.run();
}

function mainLoggedOut() {
    $(".logged-in").toggle(false);
    $(".logged-out").toggle(true);
}

(function() {
    function docReady(fn) { // https://stackoverflow.com/questions/9899372/vanilla-javascript-equivalent-of-jquerys-ready-how-to-call-a-function-whe. Avoiding jquery because it's messing up error display
        if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(fn, 1);
        else document.addEventListener("DOMContentLoaded", fn);
    }
    if (window.loggedIn) docReady(mainLoggedIn);
    else docReady(mainLoggedOut);
})();
