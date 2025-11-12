import { STORAGE_KEYS } from './storageKeys.js';

const EVENTS = Object.freeze({
    SELECTED_GENRES_CHANGED: 'selectedGenresChanged'
});

function sanitizeGenreList(genres) {
    if (!Array.isArray(genres)) return [];
    const unique = new Set();
    genres.forEach(genre => {
        if (typeof genre === 'string') {
            const trimmed = genre.trim();
            if (trimmed.length > 0) unique.add(trimmed);
        }
    });
    return Array.from(unique);
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export class StateAdapter {
    constructor(state) {
        this.state = state;
        this.listeners = new Map();
    }

    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const handlers = this.listeners.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    emit(event, payload) {
        const handlers = this.listeners.get(event);
        if (!handlers) return;
        handlers.forEach(handler => handler(payload));
    }

    getSelectedGenres() {
        const genres = this.state[STORAGE_KEYS.SELECTED_GENRES];
        return Array.isArray(genres) ? [...genres] : [];
    }

    setSelectedGenres(genres) {
        const sanitized = sanitizeGenreList(genres);
        const previous = this.getSelectedGenres();

        this.state[STORAGE_KEYS.SELECTED_GENRES] = sanitized;
        localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(sanitized));

        if (!arraysEqual(previous, sanitized)) {
            this.emit(EVENTS.SELECTED_GENRES_CHANGED, this.getSelectedGenres());
        }
        return this.getSelectedGenres();
    }

    clearSelectedGenres() {
        return this.setSelectedGenres([]);
    }

    syncSelectedGenresFromStorage() {
        let stored = [];
        try {
            stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_GENRES) || '[]');
        } catch (error) {
            stored = [];
        }
        if (!Array.isArray(stored)) {
            stored = [];
        }
        const sanitized = sanitizeGenreList(stored);
        this.state[STORAGE_KEYS.SELECTED_GENRES] = sanitized;
        return this.getSelectedGenres();
    }
}

export { EVENTS as STATE_EVENTS };

