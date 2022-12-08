'use strict';

// TODO: Remove bootstrap vibes at top
// TODO: Name checks, room fullness checks should be on client to fail faster

const VERSIONS = [
    { number: 0, features: ["you can report bugs", "afk players are hidden", "things are sorted"]},
    { number: 1, features: ["play on your phone", "'move' shows where to"]},
    { number: 2, features: ["draw on your phone (fixed)", "eraser"]},
    { number: 3, features: ["make items", "hold 3 items", "move doodle buttons", "smoother brush"]},
]
const feature_list = x => `<ol><li>${x.features.join("</li><li>")}</li></ol>`
const VERSION = {
    number: VERSIONS[VERSIONS.length-1].number,
    message: `New this update: ${feature_list(VERSIONS[VERSIONS.length-1])} New last update: ${feature_list(VERSIONS[VERSIONS.length-2])}`
}

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
        actions: ["movePlayer"],
    },
    person: {
        contents: [],
        // TODO: Edit your own art
        maxContentsSize: 3,
        placeId: "place the first room",
        actions: []
    },
    scenery: { },
    // TODO: Give someone an item. Trade someone an item.
    // TODO: Animate pick up, drop, swap, and give
    // TODO: Animate move. Ideally, load everything and THEN show new screen
    item: {
        // TODO: Swap item with someone
        actions: ["pick up", "drop"]
    },
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
        let thing = (await this.ajax("/get", {thingId})).thing;
        if (!thing) return thing;
        thing = {
            ...PRESETS[thing.type],
            ...thing,
            actions: PRESETS[thing.type].actions || [],
            pictureUrl: (this.artCache[thingId] = this.artCache[thingId] || (await this.ajax("/art", {thingId})).pictureUrl),
            creationTime: new Date(thing.creationTime || thing.creation_time || 0),
            updateTime: new Date(thing.updateTime || thing.creationTime || thing.creation_time || 0)
        }

        const now = new Date();
        const daysSinceUpdate = (now - thing.updateTime)/1000.0/3600/24;

        if (thing.type == "person") {
            thing.inventory = await Promise.all(thing.contents.map(this.get.bind(this)));

            thing.afk = daysSinceUpdate > 1;
            if (thing.afk) thing.type = "afk";
        }

        return thing;
    }
}

class UI {
    constructor(div, game) {
        this.div = div;
        this.game = game;
        this.marker = $(div.find(".afk-container")[0]);
        this.place = div.find(".place-container");
        this.things = div.find(".thing-container");
        this.mentions = div.find(".mentions");
        this.afk = div.find(".afk-container");
        this.motd = $(document).find(".motd");
        const easel = new Easel(div.find(".easel"));
        const chooser = new Chooser(div.find(".chooser"));

        // Prompt methods
        this.choice = chooser.choose.bind(chooser);
        this.makeImage = easel.makeImage.bind(easel);
        this.draw = easel.draw.bind(easel);
        this.cards = {};
    }
    add(e) {
        this.marker.before(e);
    }

    // UI methods
    async displayPlace(place) {
        this.place.html(await this.thingCard(place));
    }
    async updateThing(thing) {
        const oldCard = this.cards[thing.id];
        if (!oldCard) return;
        const newCard = await this.thingCard(thing);
        oldCard.replaceWith(newCard);
        this.cards[thing.id] = newCard;
    }
    async removeThing(thing) {
        this.cards[thing.id].remove();
        delete this.cards[thing.id];
    }
    async displayCard(thing) {
        if (thing.craft) this.displayCraft(thing);
        else await this.displayThing(thing);
    }
    async displayCraft(craft) {
        const e = this.craftCard(craft.type);
        this.marker.before(e);
    }
    async displayThing(thing) {
        const e = await this.thingCard(thing);
        if (thing.afk) {
            e.css("--order", this.afk.children().length);
            this.afk.append(e);
            this.afk.css("--cards", this.afk.children().length);
        } else this.marker.before(e);
        //scroll();
        return this.cards[thing.id] = e;
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
        this.mentions.children().remove();
        this.afk.children().remove();
        this.things.find(".thing").remove();
        this.things.find(".craft").remove();
        this.place.children().remove();
        this.cards = {};
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

        // Add inventory for a player
        if (thing.type == "person") {
            const inventory = $(`<div class="inventory"></div>`)
            for (let i=0; i<thing.inventory.length; i++) {
                const itemCard = await this.thingCard(thing.inventory[i]);
                inventory.append(itemCard);
            }
            if (this.game.player.id == thing.id) {
                const craftCard = this.craftCard("item", true);
                inventory.append(craftCard);
            }
            card.append(inventory);
        }


        // Add and bind action buttons
        const actions = card.find(".actions");
        for (let actionId of thing.actions||[]) {
            let name = actionId;
            if (actionId == "movePlayer") name = `move (${splitId(thing.targetId).name})`;
            if (actionId == "drop" && !(thing.placeId == game.player.id)) continue;
            if (actionId == "pick up" && !(thing.placeId == game.player.placeId)) continue;

            const actionE = $(`<input type="submit" class="action" value="${name}" />`);
            actionE.on("click", () => { this.game.onAction(thing, actionId); });
            actions.append(actionE);
        }
        return card;
    }
    craftCard(type, tiny) {
        const e = $(`<div class="card ${type} craft">
            <div class="type">${tiny ? type : `new ${type}`}</div>
            <div class="thing-image plus"></div>
            <div class="name">?</div>
            <div class="actions">
                <input type="submit" value="${tiny ? "draw" : `doodle ${type}`}" class="craft-${type}">
            </div>
        </div>`)
        e.on("click", () => this.game.craft({type}))
        return e;
    }
}

class Game {
    constructor(div) {
        this.backend = new Backend();
        this.ui = new UI(div, this);

        // Wait for actions, then do stuff. All async.
        this.craftBtn = div.find(".craft input");
        for (let type of ["door", "scenery", "item"]) {
            div.find(`.craft-${type}`).on("click", () => this.craft({type}))
        }
    }

    async craft(thing = {}) {
        this.craftBtn.hide();
        if (!thing.type) thing.type = await this.ui.choice("I want to make a new:", ["scenery", "door", "item"], false);
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

        if (thing.type == "place") {}
        else if (thing.type =="item") thing.placeId = this.player.id;
        else if (!thing.placeId) thing.placeId = this.player.placeId;

        // TOOD: Check if the target place is full

        thing.pictureUrl = await this.ui.draw(thing.name, thing.type=="item"&&2);

        await this.backend.create(thing); // data update
        this.created(thing, thing.placeId); // visual update. no 'await' deliberately
            
        this.ui.clearMentions();
        this.craftBtn.show();
        return thing;
    }
    async updateThingId(thingId) {
        await this.ui.updateThing(await this.backend.get(thingId));
    }
    async created(thing) { // Visual update
        if (thing.type == "place") return;

        // Display new objects locally immediately. Everyone else has to leave and come back
        else if (!this.player || thing == this.player) {} // Part of making the player at the beginning, ignore
        else if (this.player.placeId == thing.placeId) await this.ui.displayThing(thing);
        else if (thing.placeId == this.player.id) {
            this.player.contents.push(thing.id);
            this.player.inventory.push(thing);
            await this.ui.updateThing(this.player);
        }
    }

    async craftMissing(id) {
        return await this.craft(splitId(id)); // name, type
    }
    async move(thing, placeId) {
        // Does NOT visually update.
        // Does NOT update the model of where it was moved from
        const place = (await this.backend.get(placeId)) || (await this.craftMissing(placeId));
        if (thing.type != "person" && place.contents.length >= place.maxContentsSize) {
            throw `${place.name} (a ${place.type}) can only hold ${place.maxContentsSize} things`;
        }
        await this.backend.move(thing.id, placeId);
        place.contents.push(thing.id); // Save an API call to update
        thing.placeId = placeId; // Save an API call to update. Ignores updateTime.
        return {place};
    }
    async playerMove(placeId) {
        this.place = (await this.move(this.player, placeId)).place;
        this.playerArrived();
    }
    async moveItem(item, toPlaceId) {
        const fromPlaceId = item.placeId;

        await this.move(item, toPlaceId);

        if (fromPlaceId == this.place.id) this.ui.removeThing(item);
        if (toPlaceId == this.place.id) this.ui.displayThing(item);

        for (let placeId of [fromPlaceId, toPlaceId]) {
            if (splitId(placeId).type == "person") await this.updateThingId(placeId);
        }
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
        const TYPE_ORDER = ["place", "person", "scenery", "door", "item", "afk"]
        for (let type of ["scenery", "door", "item"]) things.push({craft: true, type: type});
        things.sort((a,b) => lexicalSort(a, b, x => [TYPE_ORDER.indexOf(x.type), x.craft, (x.afk?-1:1) * new Date(x.creationTime), x.name]));
        for (let thing of things) await this.ui.displayCard(thing);
    }
    async onAction(thing, actionId) {
        try {
            if (actionId == "movePlayer") await this.playerMove(thing.targetId);
            else if (actionId == "drop") await this.moveItem(thing, this.player.placeId);
            else if (actionId == "pick up") await this.moveItem(thing, this.player.id);
        } catch (error) {
            debug(error);
        }
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
