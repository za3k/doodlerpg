class Easel {
    constructor(div) {
        this.div = div;
        this.jcanvas = div.find("canvas");
        this.canvas = this.jcanvas[0];
        this.done = div.find(".done");
        this.clearBtn = div.find(".clear");
        this.thing = div.find(".name");
        this.enabled = false;
        this.canvas.height = this.jcanvas.width();
        this.canvas.width = this.jcanvas.height();
        this.clearBtn.on("click", this.clear.bind(this));
    }
    mouse(ev) {
        const rect = this.canvas.getBoundingClientRect()
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
    }
    line(mouse1, mouse2) {
        // assumes mouse (pixel) and canvas coordinates are the same, which they are here.
        const c = this.canvas.getContext("2d");
        c.beginPath();
        c.lineWidth = 5;
        c.moveTo(mouse1.x, mouse1.y);
        c.lineTo(mouse2.x, mouse2.y);
        c.stroke();
    }
    clear() {
        const c = this.canvas.getContext("2d");
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    enable() {
        this.div.toggleClass("enabled", true);
        scroll();
        // Allow drawing
        this.jcanvas.on("mousedown", (ev) => {
            let mouse = this.mouse(ev);
            this.line(mouse,mouse);
            this.jcanvas.on("mousemove", (ev) => {
                const newMouse = this.mouse(ev);
                this.line(mouse, newMouse);
                mouse = newMouse;
            })
            $(document).on("mouseup", (ev) => {
                this.jcanvas.off("mousemove");
                $(document).off("mouseup");
                const finalMouse = this.mouse(ev);
                this.line(mouse, finalMouse);
            });
        });
    }
    disable() {
        this.div.toggleClass("enabled", false);
        this.jcanvas.off("mousedown");
        $(document).off("mouseup");
        this.jcanvas.off("mousemove");
    }
    draw(thing) {
        return new Promise((done) => {
            this.thing.text(thing);
            this.clear();
            this.enable();
            
            this.done.on("click", () => {
                this.done.off("click");
                this.disable();
                const data = this.canvas.toDataURL();
                done(data);
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

class Chooser {
    constructor(div) {
        this.div = div;
        this.done = div.find(".done");
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
            scroll();
            
            this.done.on("click", () => {
                this.div.toggleClass("enabled", false);

                done(this.getAnswer());
            });
        });
    }
}
