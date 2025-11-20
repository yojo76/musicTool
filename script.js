document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const instrumentSelect = document.getElementById('instrument');
    const tempoInput = document.getElementById('tempo');
    const tempoValue = document.getElementById('tempo-value');
    const volumeInput = document.getElementById('volume');
    const volumeValue = document.getElementById('volume-value');
    const playBtn = document.getElementById('btn-play');
    const saveBtn = document.getElementById('btn-save');
    const fileInput = document.getElementById('file-input');
    const statusText = document.getElementById('status-text');
    const errorText = document.getElementById('error-text');
    const compositionInput = document.getElementById('composition-input');
    const canvas = document.getElementById('staff-canvas');
    const ctx = canvas.getContext('2d');

    // --- Constants ---
    const NOTES = {
        'Do': 0, 'Re': 1, 'Mi': 2, 'Fa': 3, 'Sol': 4, 'La': 5, 'Ti': 6, 'Si': 6
    };

    const BASE_FREQUENCIES = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88];

    const NOTE_OFFSETS = {
        'Do': 0, 'Re': 1, 'Mi': 2, 'Fa': 3, 'Sol': 4, 'La': 5, 'Ti': 6, 'Si': 6
    };

    const STAFF_Y_START = 60;
    const STAFF_HEIGHT = 80;
    const LINE_SPACING = 10;
    const NOTE_RADIUS = 5;

    // --- State ---
    let audioCtx = null;
    let parsedStaves = [];
    let isPlaying = false;
    let currentlyPlaying = null; // { staffIndex, noteIndex }
    let playbackTimeouts = []; // To clear on stop

    // --- Initialization ---
    function init() {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        tempoInput.addEventListener('input', (e) => {
            tempoValue.textContent = e.target.value;
        });

        volumeInput.addEventListener('input', (e) => {
            volumeValue.textContent = e.target.value;
        });

        compositionInput.addEventListener('input', () => {
            parseComposition();
            drawStaff();
        });

        playBtn.addEventListener('click', playComposition);
        saveBtn.addEventListener('click', saveComposition);
        fileInput.addEventListener('change', loadComposition);

        parseComposition();
        drawStaff();
    }

    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        canvas.width = Math.max(container.clientWidth, 600);
        canvas.height = 450;
        drawStaff();
    }

    // --- Parsing Logic ---
    function parseComposition() {
        const text = compositionInput.value;
        const lines = text.split(/\r?\n/);
        parsedStaves = [];
        let errors = [];

        const linesToProcess = lines.slice(0, 4);

        linesToProcess.forEach((line, lineIndex) => {
            if (!line.trim()) return;

            const staffNotes = [];
            const tokens = line.trim().split(/[\s,]+/);

            tokens.forEach((token) => {
                if (!token) return;

                if (token.toLowerCase() === 'rest' || token === '-') {
                    staffNotes.push({ type: 'rest', original: token });
                    return;
                }

                let baseToken = token.replace(/'/g, '');
                let normalizedBase = baseToken.charAt(0).toUpperCase() + baseToken.slice(1).toLowerCase();

                if (NOTES.hasOwnProperty(normalizedBase)) {
                    const octaveShift = (token.match(/'/g) || []).length;
                    const noteIndex = NOTES[normalizedBase];

                    const freq = BASE_FREQUENCIES[noteIndex] * Math.pow(2, octaveShift);
                    const visualStep = NOTE_OFFSETS[normalizedBase] + (octaveShift * 7);

                    staffNotes.push({
                        type: 'note',
                        name: normalizedBase,
                        octaveShift: octaveShift,
                        freq: freq,
                        visualStep: visualStep,
                        original: token
                    });
                } else {
                    errors.push(`Line ${lineIndex + 1}: Invalid note '${token}'`);
                }
            });

            if (staffNotes.length > 0) {
                parsedStaves.push(staffNotes);
            }
        });

        if (errors.length > 0) {
            errorText.textContent = errors.join('; ');
        } else {
            errorText.textContent = '';
        }
    }

    // --- Visualization Logic ---
    function drawStaff() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.font = '20px serif';

        parsedStaves.forEach((staffNotes, staffIndex) => {
            const startY = STAFF_Y_START + (staffIndex * STAFF_HEIGHT * 1.5);
            const bottomLineY = startY + (4 * LINE_SPACING);

            // Draw Lines
            ctx.strokeStyle = '#000';
            for (let i = 0; i < 5; i++) {
                const y = startY + (i * LINE_SPACING);
                ctx.beginPath();
                ctx.moveTo(10, y);
                ctx.lineTo(canvas.width - 10, y);
                ctx.stroke();
            }

            ctx.fillStyle = '#000';
            ctx.fillText("𝄞", 10, bottomLineY - LINE_SPACING);

            let currentX = 50;
            const spacingX = 40;

            staffNotes.forEach((note, noteIndex) => {
                const isHighlighted = currentlyPlaying &&
                                      currentlyPlaying.staffIndex === staffIndex &&
                                      currentlyPlaying.noteIndex === noteIndex;

                ctx.fillStyle = isHighlighted ? '#e74c3c' : '#000';
                ctx.strokeStyle = isHighlighted ? '#e74c3c' : '#000';

                if (note.type === 'rest') {
                    ctx.fillRect(currentX, startY + 2 * LINE_SPACING - 5, 10, 10);
                } else {
                    const yPos = bottomLineY - ((note.visualStep - 2) * (LINE_SPACING / 2));

                    ctx.beginPath();
                    ctx.ellipse(currentX, yPos, NOTE_RADIUS + 1, NOTE_RADIUS, 0, 0, 2 * Math.PI);
                    ctx.fill();

                    ctx.beginPath();
                    if (note.visualStep < 6) {
                        ctx.moveTo(currentX + NOTE_RADIUS, yPos);
                        ctx.lineTo(currentX + NOTE_RADIUS, yPos - 25);
                    } else {
                        ctx.moveTo(currentX - NOTE_RADIUS, yPos);
                        ctx.lineTo(currentX - NOTE_RADIUS, yPos + 25);
                    }
                    ctx.stroke();

                    if (note.visualStep === 0) {
                        ctx.beginPath();
                        ctx.moveTo(currentX - 8, yPos);
                        ctx.lineTo(currentX + 8, yPos);
                        ctx.stroke();
                    }
                    if (note.visualStep >= 12 && note.visualStep % 2 === 0) {
                         for (let s = 12; s <= note.visualStep; s += 2) {
                             const lY = bottomLineY - ((s - 2) * (LINE_SPACING / 2));
                             ctx.beginPath();
                             ctx.moveTo(currentX - 8, lY);
                             ctx.lineTo(currentX + 8, lY);
                             ctx.stroke();
                         }
                    }
                }

                currentX += spacingX;
            });
        });
    }

    // --- Audio Engine ---
    function playTone(freq, duration, type = 'sine', vol = 1) {
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        // Envelope
        const now = audioCtx.currentTime;
        const attack = 0.05;
        const release = 0.1;

        // Gain Control
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(vol, now + attack);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration - release);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }

    function getInstrumentSettings() {
        const inst = instrumentSelect.value;
        let type = 'sine';
        // Simple instrument approximation
        switch (inst) {
            case 'piano': type = 'triangle'; break; // Soft, slight harmonics
            case 'guitar': type = 'sawtooth'; break; // Sharper
            case 'harmonica': type = 'square'; break; // Hollow
            case 'clarinet': type = 'triangle'; break; // Woodwindy (simulated)
            default: type = 'sine';
        }
        return type;
    }

    async function playComposition() {
        if (isPlaying) return;

        // Init Audio Context on user interaction
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (parsedStaves.length === 0) {
            statusText.textContent = "No notes to play.";
            return;
        }

        isPlaying = true;
        playBtn.disabled = true;
        statusText.textContent = "Playing...";

        // Flatten staves into a single sequence for linear playback?
        // Requirement: "Input can be spread across multiple lines... intended for a separate staff".
        // Usually this means played sequentially (Line 1 then Line 2...) or simultaneously?
        // Standard notation editors play vertically (simultaneously) if they are parts,
        // OR horizontally if it's just wrapping.
        // Given the UI "lines of text input", it implies continuous melody usually.
        // Let's assume SEQUENTIAL playback (Staff 1, then Staff 2...) for a simple melody tool.

        const bpm = parseInt(tempoInput.value);
        const beatDuration = 60 / bpm; // Seconds per beat
        const volume = parseInt(volumeInput.value) / 100;
        const instrumentType = getInstrumentSettings();

        let totalDelay = 0;

        for (let sIndex = 0; sIndex < parsedStaves.length; sIndex++) {
            const staff = parsedStaves[sIndex];

            for (let nIndex = 0; nIndex < staff.length; nIndex++) {
                const note = staff[nIndex];

                // Visual Highlight Schedule
                const startTimeout = setTimeout(() => {
                    currentlyPlaying = { staffIndex: sIndex, noteIndex: nIndex };
                    drawStaff();

                    // Play Sound
                    if (note.type === 'note') {
                        playTone(note.freq, beatDuration, instrumentType, volume);
                    }
                }, totalDelay * 1000);

                playbackTimeouts.push(startTimeout);

                totalDelay += beatDuration;
            }
        }

        // Cleanup after finish
        const endTimeout = setTimeout(() => {
            currentlyPlaying = null;
            drawStaff();
            isPlaying = false;
            playBtn.disabled = false;
            statusText.textContent = "Playback complete";
            playbackTimeouts = [];
        }, totalDelay * 1000);
        playbackTimeouts.push(endTimeout);
    }

    // --- File I/O ---
    function saveComposition() {
        const text = compositionInput.value;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'composition.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function loadComposition(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            compositionInput.value = event.target.result;
            parseComposition();
            drawStaff();
        };
        reader.readAsText(file);
        // Reset input so same file can be selected again
        e.target.value = '';
    }

    init();
});
