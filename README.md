# musicTool
Simple music tool to help learn melody

Core Functional Requirements
Musical Note Input:

The system must provide a text area for users to input musical compositions.
It must accept a specific set of notes: Do, Re, Mi, Fa, Sol, La, Ti (and its alias Si).
It must support a rest command to indicate a pause or silence of one beat.
Notes can be separated by spaces or commas for flexibility.
The input can be spread across multiple lines, with each line intended for a separate staff on the visual display.
Audio Playback:

The application must be able to play the sequence of notes entered by the user.
Playback must adhere to the specified tempo, volume, and selected instrument.
If an invalid note name is encountered, the system must skip it, display a warning, and continue playback.
Tempo Control:

Users must be able to control the playback speed (tempo).
The tempo must be adjustable via a slider, ranging from 60 to 200 Beats Per Minute (BPM).
The current BPM value must be clearly displayed to the user.
Volume Control:

Users must be able to adjust the audio volume.
The volume must be adjustable via a slider, ranging from 0% (mute) to 100% (full volume).
The current volume level must be displayed as a percentage.
Instrument Selection:

The application must offer a choice of different instrument sounds.
It must provide at least four distinct instruments: Piano, Guitar, Harmonica, and Clarinet.
The user must be able to select an instrument from a dropdown menu.
User Interface and Experience (UI/UX) Requirements
Musical Staff Visualization:

The application must render the entered notes on a visual musical staff.
It must support displaying up to four separate staves, corresponding to the lines of text input.
Notes must be drawn correctly with note heads, stems, and ledger lines for notes outside the standard five-line staff (like Middle C).
Rest notes must be represented by a distinct visual symbol.
Live Playback Highlighting:

During playback, the note currently being played must be visually highlighted on the staff.
This provides real-time feedback, allowing the user to follow the music visually.
The highlight should be removed after playback is complete.
Status and Feedback:

The system must provide a status label to inform the user of its current state (e.g., "Ready", "Playing...", "Playback complete").
Error messages (e.g., "No notes entered") and warnings (e.g., "Invalid note") must be displayed to the user.
File and Data Management Requirements
Save and Load Compositions:
Users must be able to save their musical compositions (the text from the input area) to a file.
Users must be able to load compositions from a previously saved file into the application.
The application should use standard file dialogs for a familiar user experience.
Non-Functional Requirements
Usability:

The user interface must be intuitive and easy to navigate for users with minimal musical or technical knowledge.
All controls must be clearly labeled.
Robustness:

The application must handle errors gracefully without crashing. For example, the "Play" button is disabled during playback to prevent conflicts.
It should manage file I/O errors and other exceptions by displaying an informative message to the user.
Extensibility:

The system's design should allow for future enhancements, such as adding new instruments or expanding the range of supported musical notes, with reasonable effort.
