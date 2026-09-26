// Animate the same geometry that is used for hit testing and label placement.
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
            angle = end;
            return next;
        });
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

    geometry(item) {
        const mid = (item.start + item.end) / 2;
        const radius = 90;
        const offset = 10 * item.focus;
        const cx = 150 + Math.cos(mid) * offset;
        const cy = 150 + Math.sin(mid) * offset;
        return { mid, radius, cx, cy, width: 42 + 22 * item.focus,
            x: cx + Math.cos(mid) * radius, y: cy + Math.sin(mid) * radius };
    }

    orderedItems() {
        return [...this.items].sort((a, b) => a.focus - b.focus);
    }

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
        this.orderedItems().forEach(item => {
            const g = this.geometry(item);
            ctx.save();
            ctx.globalAlpha = item.opacity;
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(g.cx, g.cy, g.radius + g.width / 2, item.start, item.end);
            ctx.arc(g.cx, g.cy, g.radius - g.width / 2, item.end, item.start, true);
            ctx.closePath();
            // A rounded enlargement holds the label even when the actual share is tiny.
            // Angular proportions and the percentage remain unchanged.
            if (item.focus > 0) {
                ctx.moveTo(g.x + 32 * item.focus, g.y);
                ctx.arc(g.x, g.y, 32 * item.focus, 0, Math.PI * 2);
                ctx.closePath();
            }
            ctx.fill();
            ctx.restore();
            const fits = (item.end - item.start) * g.radius >= 56;
            const labelOpacity = fits ? 1 : item.focus;
            if (labelOpacity <= 0) return;
            ctx.save();
            ctx.globalAlpha = labelOpacity * (item.opacity / 0.92);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#111';
            ctx.shadowColor = 'rgba(255,255,255,0.85)';
            ctx.shadowBlur = 3;
            const emojiSize = 18 + 6 * item.focus;
            ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
            ctx.fillText(item.icon, g.x, g.y - (7 + 3 * item.focus), 32);
            ctx.font = `600 ${11 + 2 * item.focus}px -apple-system, BlinkMacSystemFont, sans-serif`;
            const percent = item.amount / this.total * 100;
            const label = percent < 1 ? '<1%' : Math.round(percent) + '%';
            ctx.fillText(label, g.x, g.y + (11 + 3 * item.focus), 38);
            ctx.restore();
        });
    }

    selectAt(event) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) * this.size / rect.width;
        const y = (event.clientY - rect.top) * this.size / rect.height;
        const item = this.orderedItems().reverse().find(item => {
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
