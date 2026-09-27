// The ring stays fixed. Only selection bubbles and cached labels animate.
class BudgetChart {
    constructor(canvas, onSelect) {
        this.canvas = canvas;
        this.onSelect = onSelect;
        this.items = [];
        this.frame = 0;
        this.size = 300;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        canvas.addEventListener('click', event => this.selectAt(event));
        window.addEventListener('resize', () => this.paint());
    }

    update(data, total, selectedId) {
        cancelAnimationFrame(this.frame);
        const old = new Map(this.items.map(item => [item.id, item]));
        let angle = -Math.PI / 2;
        this.items = data.map(item => {
            const end = angle + (total > 0 ? item.amount / total * Math.PI * 2 : 0);
            const previous = old.get(item.id);
            const focus = item.id === selectedId ? 1 : 0;
            const opacity = selectedId === 'all' || focus ? 0.92 : 0.28;
            const next = { ...item, start: angle, end, focus: previous?.focus ?? 0,
                opacity: previous?.opacity ?? 0.92, targetFocus: focus, targetOpacity: opacity };
            next.fromFocus = next.focus;
            next.fromOpacity = next.opacity;
            next.path = new Path2D();
            next.path.arc(150, 150, 111, angle, end);
            next.path.arc(150, 150, 69, end, angle, true);
            next.path.closePath();
            const percent = total > 0 ? item.amount / total * 100 : 0;
            const label = percent.toFixed(1).replace('.', ',') + '%';
            const dpr = window.devicePixelRatio || 1;
            next.labelKey = JSON.stringify([item.icon, label, dpr]);
            next.label = previous?.labelKey === next.labelKey ? previous.label : this.makeLabel(item.icon, label, dpr);
            angle = end;
            return next;
        });
        this.drawOrder = [...this.items].sort((a, b) => a.targetFocus - b.targetFocus);
        this.total = total;
        this.selectedId = selectedId;
        const start = performance.now();
        const animate = now => {
            const progress = this.reducedMotion.matches ? 1 : Math.min(1, (now - start) / 360);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.items.forEach(item => {
                item.focus = item.fromFocus + (item.targetFocus - item.fromFocus) * eased;
                item.opacity = item.fromOpacity + (item.targetOpacity - item.fromOpacity) * eased;
            });
            this.paint();
            if (progress < 1) this.frame = requestAnimationFrame(animate);
        };
        this.frame = requestAnimationFrame(animate);
    }

    makeLabel(icon, percent, dpr) {
        const image = document.createElement('canvas');
        image.width = image.height = Math.round(64 * dpr);
        const ctx = image.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111';
        ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.fillText(icon, 32, 22, 32);
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(percent, 32, 46, 44);
        return image;
    }

    geometry(item) {
        const mid = (item.start + item.end) / 2;
        const labelRadius = 90 + 10 * item.focus;
        return { mid, radius: 90, cx: 150, cy: 150, width: 42,
            x: 150 + Math.cos(mid) * labelRadius, y: 150 + Math.sin(mid) * labelRadius };
    }

    orderedItems() { return this.drawOrder || []; }

    paint() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const pixels = Math.round(this.size * dpr);
        if (this.canvas.width !== pixels || this.canvas.height !== pixels) {
            this.canvas.width = pixels;
            this.canvas.height = pixels;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.size, this.size);
        if (!this.total || !this.items.length) {
            ctx.beginPath();
            ctx.arc(150, 150, 90, 0, Math.PI * 2);
            ctx.strokeStyle = '#e5e5ea';
            ctx.lineWidth = 42;
            ctx.stroke();
            return;
        }
        // Paint every fixed sector first so no neighbouring sector covers a bubble.
        this.items.forEach(item => {
            ctx.globalAlpha = item.opacity;
            ctx.fillStyle = item.color;
            ctx.fill(item.path);
        });
        this.orderedItems().forEach(item => {
            const g = this.geometry(item);
            if (item.focus > 0) {
                ctx.globalAlpha = item.focus;
                ctx.fillStyle = item.color;
                ctx.beginPath();
                ctx.arc(g.x, g.y, 32 * item.focus, 0, Math.PI * 2);
                ctx.fill();
            }
            const fits = (item.end - item.start) * g.radius >= 56;
            const labelOpacity = fits ? 1 : item.focus;
            if (labelOpacity <= 0) return;
            ctx.globalAlpha = labelOpacity * (item.opacity / 0.92);
            const size = 48 + 16 * item.focus;
            // No emoji rasterization, font resizing or blurred text on animation frames.
            ctx.drawImage(item.label, g.x - size / 2, g.y - size / 2, size, size);
        });
        ctx.globalAlpha = 1;
    }

    selectAt(event) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) * this.size / rect.width;
        const y = (event.clientY - rect.top) * this.size / rect.height;
        const item = [...this.orderedItems()].reverse().find(item => {
            const g = this.geometry(item);
            if (item.focus > 0 && Math.hypot(x - g.x, y - g.y) <= 32 * item.focus) return true;
            const distance = Math.hypot(x - g.cx, y - g.cy);
            if (Math.abs(distance - g.radius) > g.width / 2) return false;
            let angle = Math.atan2(y - g.cy, x - g.cx);
            if (angle < -Math.PI / 2) angle += 2 * Math.PI;
            return angle >= item.start && angle <= item.end;
        });
        if (item) this.onSelect(item.id);
    }
}
