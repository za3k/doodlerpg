'use strict';

const VERSIONS = [
    { number: 0, features: ["you can report bugs", "afk players are hidden", "things are sorted"]},
    { number: 1, features: ["play on your phone", "'move' shows where to"]},
    { number: 2, features: ["draw on your phone (fixed)", "eraser"]},
    { number: 3, features: ["make items", "hold 3 items", "give and trade items", "move doodle buttons", "smoother brush"]},
    { number: 4, features: ["show artists", "tweak style", "zoom for tiny items"]},
]
const feature_list = x => `<ol><li>${x.features.join("</li><li>")}</li></ol>`
const VERSION = {
    number: VERSIONS[VERSIONS.length-1].number,
    message: `New this update: ${feature_list(VERSIONS[VERSIONS.length-1])} New last update: ${feature_list(VERSIONS[VERSIONS.length-2])}`
}

function scroll() { window.scrollTo(0, document.body.scrollHeight); }
function debug(e) {
    $(".error").text("");
    setTimeout(() => { // Makes sure fade animation shows
        $(".error").text(e || "");
        scroll();
    }, 1);
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
    },
    person: {
        contents: [],
        placeId: "place the first room",
    },
    // TODO: Quest: challenge the world to draw a thing
}
const OVERRIDES = {
    place: {
        maxContentsSize: 50,
        actions: [],
    },
    scenery: {
        actions: [],
    },
    door: {
        // TODO: Animate move. Ideally, load everything and THEN show new screen
        actions: ["movePlayer"],
    },
    person: {
        // TODO: Edit your own art
        maxContentsSize: 3,
        actions: ["give"]
    },
    item: {
        // TODO: Animate take, drop, swap, and give
        // TODO: Allow drag+drop? Probably not.
        actions: ["take", "drop", "trade"]
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
    has(x) { return !!this.l[x]; }
    get list() { return Object.keys(this.l); }
}
class Backend {
    lists = {}
    artCache = {}
    constructor() {
        // Load all keys on game start
        this.ajax("/things", {}).then(r => r.ids.forEach(this.see.bind(this)));
    }
    getSet(type) { return this.lists[type] = this.lists[type] || new Set(); }
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
        this.getSet(type).add(id);
    }
    async move(thingId, toPlaceId) {
        await this.ajax("/move", { thingId, toPlaceId });
    }
    async create(thing) {
        this.see(thing.id);
        await this.ajax("/create", thing);
    }
    async update(thing) {
        this.see(thing.id);
        await this.ajax("/update", thing.data);
    }
    async get(thingId) {
        if (!thingId) return
        this.see(thingId);
        let thing = (await this.ajax("/get", {thingId})).thing;
        if (!thing) return thing;
        thing = {
            data: thing,
            ...PRESETS[thing.type]||{},
            ...thing,
            pictureUrl: (this.artCache[thingId] = this.artCache[thingId] || (await this.ajax("/art", {thingId})).pictureUrl),
            ...OVERRIDES[thing.type]||{},
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
    removeThing(thing) {
        this.cards[thing.id].remove();
        delete this.cards[thing.id];
    }
    async displayCard(thing) {
        if (thing.craft) this.displayCraft(thing);
        else await this.displayThing(thing);
    }
    async displayCraft(craft) {
        const e = this.craftCard(craft.type, false, game.place.id);
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
        return e;
    }
    displayMotd(motd) {
        this.motd.html(motd);
    }
    scrollTo(thingId) {
        let oldCard = this.cards[thingId];
        if (!oldCard) return;
        // Scroll to the top-level card.
        while (oldCard.is(".inventory .dcard")) oldCard = oldCard.parents(".dcard").first();
        oldCard[0].scrollIntoView();
    }
    toggleActions(enabled) {
        this.div.find(".action").toggleClass("hidden", !enabled);
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
        this.things.find(".dcard").remove();
        this.place.children().remove();
        this.cards = {};
    }

    // Template filler methods
    mentionCard(text) {
        return $(`<span class="mention">${text}</span>`);
    }
    zoom(ev) {
        const card = $(ev.target).parents(".dcard").first();
        const zoomed = card.hasClass("zoom");
        $(".zoom").removeClass("zoom");
        card.toggleClass("zoom", !zoomed);
    }
    async thingCard(thing) {
        // Make the base card
        const typeReplace = { "afk": "sleeping" };
        const card = $(`<div class="thing dcard ${thing.type}">
            <img class="thing-image"/>
            <div>
                <span class="name">${thing.name}</span>
                <span class="type">(${typeReplace[thing.type]||thing.type})</span>
            </div>
            <div class="actions"></div>
        </div>`);

        // Draw the picture
        const image = $(await this.makeImage(thing.pictureUrl));
        image.addClass("thing-image");
        card.find("img").replaceWith(image);
        image.prop("title", `"${thing.name}" by ${ thing.creator || "anonymous"}`);
        image.on("click", this.zoom);

        // Add inventory for a player (but not afk players)
        if (thing.type == "person" || thing.type == "afk") {
            const inventory = $(`<div class="inventory"></div>`)
            for (let i=0; i<thing.inventory.length; i++) {
                const itemCard = await this.thingCard(thing.inventory[i]);
                inventory.append(itemCard);
            }
            if (this.game.player.id == thing.id) {
                const craftCard = this.craftCard("item", true, thing.id);
                inventory.append(craftCard);
            }
            card.append(inventory);
        }

        // Add and bind action buttons
        const actions = card.find("> .actions");
        for (let actionId of thing.actions||[]) {
            let name = actionId;
            if (actionId == "movePlayer") name = `move (${splitId(thing.targetId).name})`;
            if (actionId == "drop" && !(thing.placeId == game.player.id)) continue;
            if (actionId == "take" && !(thing.placeId == game.player.placeId)) continue;
            if (actionId == "give" && !(thing.id != game.player.id)) continue;
            if (actionId == "trade" && !(splitId(thing.placeId).type == "person" && thing.placeId != game.player.id)) continue;

            if (actionId == "give" && thing.inventory) {
                const actionCard = this.actionCard("item", "", "give");
                actionCard.find(".action").on("click", () => { this.game.onAction(thing, actionId); });
                card.find(".inventory").append(actionCard);

            } else {
                const actionE = $(`<input type="submit" class="action" value="${name}" />`);
                actionE.on("click", () => { this.game.onAction(thing, actionId); });
                actions.append(actionE);
            }
        }
        this.cards[thing.id] = card;
        return card;
    }
    actionCard(type, name, action) {
        const card = $(`<div class="dcard ${type} action-card">
            <div class="thing-image plus"></div>
            <div>
                <span class="name">${name}</span>
                <span class="type">make ${type}</span>
            </div>
            <div class="actions">
                <input type="submit" value="${action}" class="action">
            </div>
        </div>`);
        card.find(".thing-image").on('click', this.zoom);
        return card;
    }
    craftCard(type, tiny, placeId) {
        const e = this.actionCard(type, "", "draw");
        e.on("click", () => {
            this.game.craft({type, placeId}).then(thing => {
                this.scrollTo(thing.id)
            })
        });
        return e;
    }
}

class Game {
    constructor(div) {
        this.backend = new Backend();
        this.ui = new UI(div, this);
    }

    async craft(thing = {}) {
        this.ui.toggleActions(false);

        try {
            if (!thing.type) thing.type = await this.ui.choice("I want to make a new:", ["scenery", "door", "item"], false);
            else this.ui.mention(`You are making a new ${thing.type}.`);

            thing = {
                ...deepcopy(PRESETS[thing.type]),
                ...thing,
            }
            if (thing.type == "place") {}
            else if (!thing.placeId) thing.placeId = this.player.placeId;

            const place = await this.backend.get(thing.placeId)
            this.assertCanAdd(thing, place)

            if (!thing.name) {
                do {
                    thing.name = await this.ui.choice(`I'm making a ${thing.type} named:`, [], true)
                } while (!this.checkValidName(thing.type, thing.name));
            }
            else this.ui.mention(`Your ${thing.type} is named ${thing.name}`);
            thing.id = `${thing.type} ${thing.name}`;

            if (thing.type == "door") {
                if (!thing.targetId) {
                    const targetName = await this.ui.choice(`When someone goes through ${thing.name}, they should end up in: `, this.backend.listAll("place").map((id) => splitId(id).name), true);
                    thing.targetId = `place ${targetName}`
                } else this.ui.mention(`When someone goes from ${thing.name}, they will end up in ${thing.targetId}`);
            }

            thing.pictureUrl = await this.ui.draw(thing.name, thing.type=="item"&&2);

            // Data update
            await this.backend.create(thing);

            // Visual update
            this.ui.clearMentions();
            await this.created(thing, thing.placeId);
            return thing;
        } finally {
            this.ui.toggleActions(true);
        }
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
    assertCanAdd(thing, toPlace) {
        const canAdd = !toPlace || thing.type == "person" || toPlace.contents.length < toPlace.maxContentsSize;
        if (!canAdd) throw `${toPlace.name} (a ${toPlace.type}) can only hold ${toPlace.maxContentsSize} things`;
    }
    assertValidName(type, name) {
        const id = `${type} ${name}`;
        if (name == "") throw `Names can't be blank`;
        else if (this.backend.getSet(type).has(id)) throw `Somewhere in the doodleverse, something already has that name. Please come up with an original name.`;
        else if (name.length >= 200) throw `That name is WAY too long, buddy.`;
    }
    checkValidName(type, name) {
        try { this.assertValidName(type, name); return true; }
        catch (e) { debug(e); return false; }
    }
    async move(thing, toPlaceId, noLimit) {
        const fromPlaceId = thing.placeId;
        const toPlace = (await this.backend.get(toPlaceId)) || (await this.craftMissing(toPlaceId));
        if (!noLimit) this.assertCanAdd(thing, toPlace);
        await this.backend.move(thing.id, toPlaceId);

        // Model updates for toPlace, fromPlace, thing.
        // Save an API call to update toPlace
        toPlace.contents.push(thing.id);
        if (toPlace.inventory) toPlace.inventory.push(thing);
        // Save an API call to update thing
        thing.placeId = toPlaceId;
        thing.updateTime = new Date();
        // Actually use API to update fromPlace
        const fromPlace = await this.backend.get(fromPlaceId);

        // Visual updates
        if (fromPlaceId == this.place.id) await this.ui.removeThing(thing);
        if (toPlaceId == this.place.id) await this.ui.displayThing(thing);
        await this.ui.updateThing(fromPlace);
        await this.ui.updateThing(toPlace);
        //await this.ui.updateThing(thing); // Not needed in theory yet

        if (thing.id == this.player.id) {
            this.place = toPlace;
            this.playerArrived();
        }
        if (fromPlace.id == this.player.id) this.player = fromPlace;

        return {toPlace, fromPlace, thing};
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
    async giveToPerson(person) {
        if (this.player.contents.length == 0) throw "You don't have any items to give away.";
        if (person.contents.length >= person.maxContentsSize) throw `${person.name} (${person.type}) can only have ${person.maxContentsSize} things at a time`;

        const itemName = await this.ui.choice(`I want to give ${person.name} my: `, this.player.contents.map(id => splitId(id).name), false);
        for (let item of this.player.inventory) {
            if (item.name == itemName) this.move(item, person.id);
        }
        this.ui.scrollTo(person.id);
    }
    async tradeFor(thing) {
        if (this.player.contents.length == 0) throw "You don't have any items to trade with.";
        const person = await this.backend.get(thing.placeId);
        if (person.type != "person") return;
        const itemName = await this.ui.choice(`In exchange for ${thing.name} I want to give ${person.name} my: `, this.player.contents.map(id => splitId(id).name), false);
        for (let item of this.player.inventory) {
            if (item.name == itemName) {
                await this.move(thing, this.player.id, true);
                await this.move(item, person.id, true);
                break;
            }
        }
        this.ui.scrollTo(this.player.id);
    }
    async onAction(thing, actionId) {
        try {
            if (actionId == "movePlayer") await this.move(this.player, thing.targetId);
            else if (actionId == "drop") await this.move(thing, this.player.placeId);
            else if (actionId == "take") await this.move(thing, this.player.id);
            else if (actionId == "give") await this.giveToPerson(thing);
            else if (actionId == "trade") await this.tradeFor(thing);
        } catch (error) {
            if (typeof(error) == "object") throw error;
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
        if (this.player = await this.backend.get(yourId)) {
            await this.backend.update(this.player); // Update timestamp
        } else {
            this.player = await this.craft({type: "person", placeId: firstRoomId, name: window.userId});
        }

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
