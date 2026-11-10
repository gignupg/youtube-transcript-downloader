# Transcripts

Output folder for downloaded YouTube transcripts.

Files are named `<video title> - <channel name>.txt`.

The `*.txt` files here are gitignored — Chrome saves them into
`%USERPROFILE%\Downloads\YouTube Transcripts`, which is a junction pointing at
this folder. To recreate the junction:

```cmd
mklink /J "%USERPROFILE%\Downloads\YouTube Transcripts" "C:\Users\linus\GitHub\youtube-transcript-downloader\transcripts"
```
