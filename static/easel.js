class Easel {
    constructor(div) {
        this.div = div;
        this.jcanvas = div.find("canvas");
        this.canvas = this.jcanvas[0];
        this.done = div.find(".done");
        this.cancel = div.find(".cancel");
        this.clearBtn = div.find(".clear");
        this.tools = div.find(".tool");
        this.thing = div.find(".name");
        this.enabled = false;
        this.canvas.height = 400;
        this.canvas.width = 400;
        this._dirty = false;
        this.clearBtn.on("click", () => {
            if (this.dirty && !window.confirm("Really delete your drawing?")) return;
            this.clear();
        });
        this.tools.on("click", (ev) => {
            this.toggleTool($(ev.target));
        });
        this.tool = "pencil";
    }
    mouse(ev) {
        const rect = this.canvas.getBoundingClientRect()
        return { x: (ev.clientX - rect.left)/rect.width*this.canvas.width, y: (ev.clientY - rect.top)/rect.height*this.canvas.height }
    }
    line(mouse1, mouse2) {
        // assumes mouse (pixel) and canvas coordinates are the same, which they are here.
        this.dirty = true;
        const c = this.canvas.getContext("2d");
        const tool = {
            pencil: {
                lineWidth: 5,
                strokeStyle: "#000000",
                lineCap: "round",
                globalCompositeOperation: "destination-over",
            },
            eraser: {
                lineWidth: 10,
                strokeStyle: "#ffffff",
                lineCap: "round",
                globalCompositeOperation: "destination-out",
            }
        }[this.tool];
        for (let [k, v] of Object.entries(tool)) c[k] = v;
        c.lineWidth *= this.thicknessMultiplier;
        c.beginPath();
        c.moveTo(mouse1.x, mouse1.y);
        c.lineTo(mouse2.x, mouse2.y);
        c.stroke();
    }
    toggleTool(toolElement) {
        this.tool = toolElement.data("tool");
        this.tools.removeClass("tool-selected");
        toolElement.addClass("tool-selected");
    }
    clear() {
        const c = this.canvas.getContext("2d");
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.dirty = false;
    }
    loadArt(dataUrl) {
        const c = this.canvas.getContext("2d");
        this.dirty = true;
        return new Promise(done => {
            const imageObj = new Image();
            imageObj.onload = () => {
                c.drawImage(imageObj, 0, 0, this.canvas.width, this.canvas.height);
                done();
            }
            imageObj.src = dataUrl;
        });
    }
    get dirty() { return this._dirty; }
    set dirty(v) {
        this._dirty = v;
        this.cancel.toggleClass("hidden", v);
        this.clearBtn.toggleClass("hidden", !v);
    }
    enable() {
        this.div.toggleClass("enabled", true);
        scroll(); // Why doesn't it scroll to include the buttons after, on chrome's test mobile?
        // Allow drawing
        const engage = ev => {
            let mouse = this.mouse(ev);
            this.line(mouse,mouse);
            const move = ev => {
                ev.preventDefault()
                ev.stopPropagation();
                const newMouse = this.mouse(ev);
                this.line(mouse, newMouse);
                mouse = newMouse;
            };
            const disengage = ev => {
                this.jcanvas.off("mousemove");
                this.jcanvas.off("touchmove");
                $(document).off("mouseup");
                $(document).off("touchend");
                const finalMouse = this.mouse(ev);
                this.line(mouse, finalMouse);
            };
            this.jcanvas.on("mousemove", move);
            this.jcanvas.on("touchmove", ev => {
                const touch = ev.touches[0];
                ev.preventDefault()
                ev.stopPropagation();
                var mouseEvent = new MouseEvent("mousemove", {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                this.jcanvas[0].dispatchEvent(mouseEvent);
            });
            $(document).on("mouseup", disengage);
            $(document).on("touchend", disengage);
        };
        this.jcanvas.on("mousedown", engage);
        this.jcanvas.on("touchstart", ev => engage(ev.touches[0]));
    }
    disable() {
        this.div.toggleClass("enabled", false);
        this.jcanvas.off("mousedown");
        $(document).off("mouseup");
        this.jcanvas.off("mousemove");
    }
    draw(thing, thicknessMultiplier, oldArt) {
        this.thicknessMultiplier = thicknessMultiplier || 1;
        return new Promise((done) => {
            this.thing.text(thing);
            this.clear();
            if (oldArt) this.loadArt(oldArt).then(this.enable.bind(this));
            else this.enable();
            
            this.done.on("click", () => {
                this.done.off("click");
                this.cancel.off("click");
                this.disable();
                const data = this.canvas.toDataURL();
                done(data);
            });
            this.cancel.on("click", () => {
                if (this.dirty && !window.confirm("Really cancel, deleting your drawing?")) return;
                this.done.off("click");
                this.cancel.off("click");
                this.disable();
                done();
            });
        });
    }
    makeImage(data) {
        return new Promise(resolve => {
            const img = new Image();
            img.src = data;
            img.onload = () => {
                resolve(img);
            };
        });
    }
}

class Chooser { // TODO: Make mobile friendly
    constructor(div) {
        this.div = div;
        this.done = div.find(".done");
        this.cancel = div.find(".cancel");
        this.custom = div.find("input.custom");
        this.select = div.find("select");
        this.or = div.find(".or");
        this.prompt = div.find(".prompt");
        this.enabled = false;
        this.allowCustom = false;
    }
    clear() {
        this.select[0].value = "";
        this.custom[0].value = "";
        this.select.children().remove();
    }
    getAnswer() {
        return (this.allowCustom && this.custom[0].value) || this.select[0].value
    }
    choose(prompt, premadeOptions, allowCustom) {
        this.clear();
        this.prompt.text(prompt);

        for (let option of premadeOptions) this.select.append($(`<option value="${option}">${option}</option>`));

        this.allowCustom = allowCustom;
        const allowPremade = premadeOptions.length > 0;

        this.select.toggle(allowPremade);
        this.custom.toggle(allowCustom);
        this.or.toggle(allowPremade && allowCustom);

        return new Promise((done) => {
            this.div.toggleClass("enabled", true);
            if (allowPremade) this.select.focus();
            else this.custom.focus();
            scroll();
            
            const over = () => {
                this.div.toggleClass("enabled", false);
                this.custom.off("keydown");
                done(this.getAnswer());
            };
            const cancel = () => {
                this.div.toggleClass("enabled", false);
                this.custom.off("keydown");
                done();
            };
            this.done.on("click", over);
            this.cancel.on("click", cancel);
            if (this.allowCustom) this.custom.on("keydown", (e) => {
                if (e.key === "Escape") cancel();
                if (e.key == "Enter") over();
            });
        });
    }
}
