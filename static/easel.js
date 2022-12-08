class Easel {
    constructor(div) {
        this.div = div;
        this.jcanvas = div.find("canvas");
        this.canvas = this.jcanvas[0];
        this.done = div.find(".done");
        this.clearBtn = div.find(".clear");
        this.toolBtn = div.find(".tool");
        this.thing = div.find(".name");
        this.enabled = false;
        this.canvas.height = this.jcanvas.width();
        this.canvas.width = this.jcanvas.height();
        this.clearBtn.on("click", this.clear.bind(this));
        this.toolBtn.on("click", this.toggleTool.bind(this));
        this.tool = "pencil";
    }
    mouse(ev) {
        const rect = this.canvas.getBoundingClientRect()
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
    }
    line(mouse1, mouse2) {
        // assumes mouse (pixel) and canvas coordinates are the same, which they are here.
        const c = this.canvas.getContext("2d");
        const tool = {
            pencil: {
                lineWidth: 5,
                strokeStyle: "#000000"
            },
            eraser: {
                lineWidth: 10,
                strokeStyle: "#ffffff"
            }
        }[this.tool];
        for (let [k, v] of Object.entries(tool)) {
            console.log(tool, k, v, c);
            c[k] = v;
        }
        c.beginPath();
        c.moveTo(mouse1.x, mouse1.y);
        c.lineTo(mouse2.x, mouse2.y);
        c.stroke();
    }
    toggleTool() {
        const tools = ["pencil", "eraser"];
        this.tool = tools[(tools.indexOf(this.tool)+1)%tools.length];
        this.toolBtn[0].value = this.tool.slice(0,1).toUpperCase() + this.tool.slice(1);
        for (let x of tools) this.toolBtn.toggleClass(x, this.tool == x);
    }
    clear() {
        const c = this.canvas.getContext("2d");
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

class Chooser { // TODO: Make mobile friendly
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
            if (allowPremade) this.select.focus();
            else this.custom.focus();
            scroll();
            
            const over = () => {
                this.div.toggleClass("enabled", false);
                done(this.getAnswer());
                this.custom.off("keydown");
            }
            this.done.on("click", over);
            if (this.allowCustom) this.custom.on("keydown", (e) => {
                if (e.which == 13) over();
            });
        });
    }
}
