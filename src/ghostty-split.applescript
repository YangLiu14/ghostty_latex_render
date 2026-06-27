-- Split the focused Ghostty terminal and run a command in the new surface.
-- Usage (from osascript): osascript ghostty-split.applescript "<command>" "<workdir>" "<direction>"
-- direction: right | left | up | down
on run argv
	set theCommand to item 1 of argv
	set theWorkdir to item 2 of argv
	set dirName to item 3 of argv

	tell application "Ghostty"
		set cfg to new surface configuration
		set command of cfg to theCommand
		set initial working directory of cfg to theWorkdir
		set wait after command of cfg to true

		set targetTerm to focused terminal of selected tab of front window

		if dirName is "left" then
			split targetTerm direction left with configuration cfg
		else if dirName is "up" then
			split targetTerm direction up with configuration cfg
		else if dirName is "down" then
			split targetTerm direction down with configuration cfg
		else
			split targetTerm direction right with configuration cfg
		end if
	end tell
end run
