'use strict';

function debug(e) { $(".error").text(e || ""); }
function scroll() { window.scrollTo(0, document.body.scrollHeight); }
function deepcopy(o) { return JSON.parse(JSON.stringify(o)); }

const PRESETS = {
    place: {
        contents: [],
    },
    door: {
        actions: {"move": "movePlayer"},
    },
    person: {
    },
    scenery: {
    }
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
                success: success,
                failure: (r) => {
                    debug(r.error);
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
        this.artCache[thingId] = this.artCache[thingId] || this.ajax("/art", {thingId});
        const thing = (await this.ajax("/get", {thingId})).thing;
        thing.pictureUrl = (await this.artCache[thingId]).pictureUrl;
        return thing;
    }
}

class UI {
    constructor(div, game) {
        this.div = div;
        this.game = game;
        this.place = div.find(".place-container");
        this.things = div.find(".thing-container");
        const easel = new Easel(div.find(".easel"));
        const chooser = new Chooser(div.find(".chooser"));

        // Prompt methods
        this.choice = chooser.choose.bind(chooser);
        this.makeImage = easel.makeImage.bind(easel);
        this.draw = easel.draw.bind(easel);
    }
    add(e) {
        this.things.append(e);
        //scroll();
    }

    // UI methods
    async displayPlace(place) {
        this.place.html(await this.thingCard(place));
    }
    async displayThing(thing) {
        this.add(await this.thingCard(thing));
    }

    mention(text) { this.add(this.mentionCard(text)); }
    clear() {
        this.things.find(":not(.craft)").remove();
        this.place.children().remove();
    }

    // Template filler methods
    mentionCard(text) {
        return $(`<span class="mention">${text}</span>`);
    }
    async thingCard(thing) {
        // Make the base card
        const card = $(`<div class="thing ${thing.type}"><div class="type">${thing.type}</div><canvas class="thing-image"></canvas><div class="name">${thing.name}</div><div class="actions"></div></div>`);

        // Draw the picture
        const image = await this.makeImage(thing.pictureUrl);
        const canvas = card.find("canvas");
        const context = canvas[0].getContext("2d");
        canvas[0].width = canvas[0].height = 200;
        context.drawImage(image, 0, 0, canvas[0].width, canvas[0].height)

        // Add and bind action buttons
        const actions = card.find(".actions");
        for (let [name, action] of Object.entries(thing.actions||{})) {
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
        this.craftBtn = div.find(".craft")
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

        await this.backend.created(thing); // data update
        this.created(thing, thing.placeId); // visual update. no 'await' deliberately
            
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
        this.place = await this.backend.get(placeId) || await this.craftMissing(placeId);
        this.backend.move(this.player, placeId);
        this.playerArrived();
    }
    async playerArrived() {
        this.ui.clear();
        await this.ui.displayPlace(this.place);

        for (let thingPromise of this.place.contents.map(this.backend.get.bind(this.backend))) {
            // Load each one in order, but requests go in parallel.
            const thing = await thingPromise;
            if (thing) {
                await this.ui.displayThing(thing);
            } else debug("Thing is here but not created");
        }
    }
    async onAction(thing, action) {
        if (action == "movePlayer") this.playerMove(thing.targetId);
    }
    async run() {
        const yourId = `person ${window.userId}`;
        const firstRoomId = "place the first room";
        //const firstRoom = await this.backend.get(firstRoomId) || await this.craft({type: "place", name: splitId(firstRoomId).name}); // Needed for the very first player only.
        this.player = await this.backend.get(yourId) || await this.craft({type: "person", placeId: firstRoomId, name: window.userId});
        this.place = await this.backend.get(this.player.placeId) || await this.craftMissing(this.player.placeId);
        this.playerArrived();

        // Wait for actions, then do stuff. All async.
        this.craftBtn.on("click", () => this.craft());
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
