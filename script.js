document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const instrumentSelect = document.getElementById('instrument');
    const tempoInput = document.getElementById('tempo');
    const tempoValue = document.getElementById('tempo-value');
    const volumeInput = document.getElementById('volume');
    const volumeValue = document.getElementById('volume-value');
    const metronomeBtn = document.getElementById('btn-metronome');
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

    // --- Audio Engine State (Lookahead Scheduler) ---
    let audioCtx = null;
    let parsedStaves = []; // Array of arrays of notes

    // Timing
    let lookahead = 25.0; // ms
    let scheduleAheadTime = 0.1; // s
    let nextBeatTime = 0.0; // When the next beat (metronome click) is due
    let beatCount = 0; // Current beat number (for sync)
    let tempo = 120.0;
    let timerID = null;

    // Metronome State
    let isMetronomeOn = false;

    // Playback State
    let isMusicPlaying = false;
    let musicStartTime = 0; // The exact time the music started (aligned to beat)
    let musicCurrentNoteIndices = []; // [noteIndexForStaff0, noteIndexForStaff1...]
    let scheduledNotes = []; // To track for visualization { time, staffIndex, noteIndex }

    // --- Initialization ---
    function init() {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        tempoInput.addEventListener('input', (e) => {
            tempoValue.textContent = e.target.value;
            tempo = parseFloat(e.target.value);
        });

        volumeInput.addEventListener('input', (e) => {
            volumeValue.textContent = e.target.value;
        });

        compositionInput.addEventListener('input', () => {
            parseComposition();
            drawStaff();
        });

        metronomeBtn.addEventListener('click', toggleMetronome);
        playBtn.addEventListener('click', startMusicPlayback);
        saveBtn.addEventListener('click', saveComposition);
        fileInput.addEventListener('change', loadComposition);

        parseComposition();
        drawStaff();

        // Start the visual loop
        requestAnimationFrame(drawLoop);
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

    // --- Audio Scheduler ---

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function toggleMetronome() {
        initAudio();
        isMetronomeOn = !isMetronomeOn;

        if (isMetronomeOn) {
            metronomeBtn.textContent = "Metronome ON";
            metronomeBtn.classList.add('active');
            statusText.textContent = "Metronome ON";

            // Start the scheduler if not already running
            // If music is not playing, we need to kickstart the loop
            if (!isMusicPlaying && !timerID) {
                nextBeatTime = audioCtx.currentTime + 0.1;
                beatCount = 0;
                timerID = setInterval(scheduler, lookahead);
            }
        } else {
            metronomeBtn.textContent = "Metronome";
            metronomeBtn.classList.remove('active');
            statusText.textContent = "Metronome OFF";

            // If music is NOT playing, stop the scheduler
            if (!isMusicPlaying) {
                clearInterval(timerID);
                timerID = null;
            }
        }
    }

    function startMusicPlayback() {
        initAudio();
        if (isMusicPlaying) return; // Already playing? (Though button is disabled)

        if (parsedStaves.length === 0) {
            statusText.textContent = "No notes to play.";
            return;
        }

        playBtn.disabled = true;

        // Reset music indices
        musicCurrentNoteIndices = new Array(parsedStaves.length).fill(0);
        scheduledNotes = [];

        // Sync Logic
        if (isMetronomeOn) {
            statusText.textContent = "Waiting for metronome...";
            // The music will start at the *next* beat time calculated by the scheduler
            // We set a flag to tell the scheduler "Music wants to start at nextBeatTime"
            musicStartTime = nextBeatTime; // Will be refined in scheduler?
            // Actually, simpler:
            // We just set isMusicPlaying = true.
            // The scheduler loop will see this.
            // We need to ensure we align with the grid.
            // Let's say music starts at the exact time of the *next* scheduled beat.
            musicStartTime = nextBeatTime;
        } else {
            // Start immediately (with small buffer)
            musicStartTime = audioCtx.currentTime + 0.1;
            nextBeatTime = musicStartTime; // Align grid to now
            beatCount = 0;
            statusText.textContent = "Playing...";

            // Start scheduler if not running
            if (!timerID) {
                timerID = setInterval(scheduler, lookahead);
            }
        }

        isMusicPlaying = true;
        // If we waited, the status text update happens when the first note plays?
        // Or we leave "Waiting..." until time hits.
    }

    function scheduler() {
        // While there are notes that will play closer than scheduleAheadTime
        while (nextBeatTime < audioCtx.currentTime + scheduleAheadTime) {
            scheduleBeat(nextBeatTime, beatCount);

            // Advance time
            const secondsPerBeat = 60.0 / tempo;
            nextBeatTime += secondsPerBeat;
            beatCount++;
        }
    }

    function scheduleBeat(time, beat) {
        // 1. Play Metronome Click if ON
        if (isMetronomeOn) {
            playMetronomeClick(time);
        }

        // 2. Play Music Notes if ON and Time >= musicStartTime
        if (isMusicPlaying && time >= musicStartTime) {
            // We treat the "time" as the start of the beat.
            // We assume one note per beat for simplicity based on previous implementation.
            // (Requirement: "Do Re Mi..." usually quarter notes).

            let notesPlayedOrFinished = false;
            let anyStaffHasNotes = false;

            // For each staff
            parsedStaves.forEach((staff, sIndex) => {
                const nIndex = musicCurrentNoteIndices[sIndex];

                if (nIndex < staff.length) {
                    anyStaffHasNotes = true;
                    const note = staff[nIndex];

                    // Schedule Audio
                    if (note.type === 'note') {
                        playNoteAudio(note.freq, time, 60.0 / tempo);
                    }

                    // Schedule Visual Update (push to queue)
                    scheduledNotes.push({
                        time: time,
                        staffIndex: sIndex,
                        noteIndex: nIndex
                    });

                    // Increment index for this staff
                    musicCurrentNoteIndices[sIndex]++;
                }
            });

            // Check if all staves are finished
            // If for this beat, no staff had a note to play (because all are finished), stop.
            if (!anyStaffHasNotes) {
                stopMusic();
            } else {
                if (statusText.textContent === "Waiting for metronome...") {
                    statusText.textContent = "Playing...";
                }
            }
        }
    }

    function stopMusic() {
        isMusicPlaying = false;
        playBtn.disabled = false;
        statusText.textContent = isMetronomeOn ? "Metronome ON" : "Playback complete";

        // If Metronome is OFF, stop the scheduler loop completely
        if (!isMetronomeOn) {
            clearInterval(timerID);
            timerID = null;
        }
    }

    function playMetronomeClick(time) {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.3, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(time);
        osc.stop(time + 0.1);
    }

    function playNoteAudio(freq, time, duration) {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = getInstrumentSettings();
        osc.frequency.value = freq;

        const vol = parseInt(volumeInput.value) / 100;

        // Attack/Release
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(vol, time + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.05);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(time);
        osc.stop(time + duration);
    }

    function getInstrumentSettings() {
        const inst = instrumentSelect.value;
        switch (inst) {
            case 'piano': return 'triangle';
            case 'guitar': return 'sawtooth';
            case 'harmonica': return 'square';
            case 'clarinet': return 'triangle';
            default: return 'sine';
        }
    }

    // --- Visual Loop (Syncs with Audio Time) ---
    function drawLoop() {
        if (isMusicPlaying || scheduledNotes.length > 0) {
            const currentTime = audioCtx ? audioCtx.currentTime : 0;
            let needDraw = false;

            // Check scheduled notes
            // We want to highlight the note that is *currently* playing (time <= currentTime < time + duration)
            // But since we only schedule exact beat times, we just check the latest passed beat.

            // Find the latest note for each staff that has started
            let activeNotes = null;

            // Filter out old notes (older than 1 beat duration + extra)
            const duration = 60.0 / tempo;

            // Clean up old scheduled notes
            while (scheduledNotes.length > 0 && scheduledNotes[0].time < currentTime - duration) {
                scheduledNotes.shift();
            }

            // Determine currently playing (the one with time <= currentTime and closest to currentTime)
            // We might have multiple simultaneous notes (different staves)
            // Group by staff
            // Actually we just want to know which one to highlight.
            // Highlighting logic: Highlight note if currentTime is within [note.time, note.time + duration]

            currentlyPlaying = null; // Global var used by drawStaff

            // We need a structure that drawStaff understands.
            // currentlyPlaying was { staffIndex, noteIndex }
            // But we support multiple staves playing at once now.
            // Let's update drawStaff to support an array or map of highlights?
            // For now, let's just highlight the *latest* started note for each staff?
            // Or simplified: Just redraw if scheduledNotes has something active.

            // Let's verify if we need to update the "currentlyPlaying" state
            // Find active notes
            const active = scheduledNotes.filter(n => currentTime >= n.time && currentTime < n.time + duration);

            if (active.length > 0) {
                 // We need to change drawStaff to handle multiple highlights?
                 // For now, let's just highlight one for simplicity or modify drawStaff.
                 // Let's modify drawStaff to accept a list of highlights.
                 currentlyPlaying = active; // Assign array
                 needDraw = true;
            } else {
                if (currentlyPlaying !== null) {
                    currentlyPlaying = null;
                    needDraw = true;
                }
            }

            if (needDraw) {
                drawStaff();
            }
        }

        requestAnimationFrame(drawLoop);
    }

    // --- Visualization Logic (Updated for Multi-Highlight) ---
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
                // Check highlight
                let isHighlighted = false;
                if (currentlyPlaying) {
                    // It's an array now
                    if (Array.isArray(currentlyPlaying)) {
                        isHighlighted = currentlyPlaying.some(n => n.staffIndex === staffIndex && n.noteIndex === noteIndex);
                    } else if (currentlyPlaying.staffIndex === staffIndex && currentlyPlaying.noteIndex === noteIndex) {
                         isHighlighted = true;
                    }
                }

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
        e.target.value = '';
    }

    init();
});
