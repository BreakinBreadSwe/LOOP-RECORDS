# Loop Records for Mac

The Loop Records back office in its own Mac window, plus reading CDs straight into the catalog.

What it adds to the website:

* It notices when a CD goes in and opens it on Back office, Import from CD (Cmd+I).
* Ordinary music CDs: macOS shows them as AIFF files with a table of contents. The app works out the
  MusicBrainz disc id from it, asks MusicBrainz what the disc is (title, artist, catalogue number,
  track titles) and uses the exact track lengths from the disc, so the back office can find the release.
* Tracks from music CDs and WAV/AIFF files are converted to AAC at 256 kbit/s with macOS's own
  `afconvert` before upload (about 2 MB a minute). MP3, AAC and FLAC files go as they are.
* "Choose a folder on this Mac" for ripped CDs or any folder of sound files.

The page itself always comes from the live site (`LOOP_SITE` overrides it), so the app never needs
updating for back office changes. Only the Loop Records site can use the app's CD functions.
Links to other sites open in the normal browser. Sign in with the code from the email (the link
in the email opens the browser instead).

## Build

    cd desktop && npm install && npm test && npm run dist

Writes `dist/Loop-Records-<version>-arm64.zip` (Apple Silicon) and `-x64.zip` (Intel).
Built on a Mac (or by the "Mac app" GitHub workflow) the app gets an ad-hoc signature. Built
elsewhere it is unsigned. Without Loop's Apple Developer ID it isn't notarized, so the first time:
unzip, move "Loop Records" to Applications, then in Terminal

    xattr -cr "/Applications/Loop Records.app"
    codesign --force --deep --sign - "/Applications/Loop Records.app"

and open it. With a Developer ID, set `CSC_LINK`/`CSC_KEY_PASSWORD` and add notarization.
