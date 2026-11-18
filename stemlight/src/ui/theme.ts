// The app's black-and-grey look for everything that isn't a world (the worlds keep their own palettes).
// Amber stays the one colour: it marks what's yours (a hit, your song, your world).
export const UI = {
  glass: '#2A2E33', // panels and the ribbon's glass
  quiet: '#6B7279', // ticks, guides, quiet lines
  touch: '#E6E8EA', // touchable edges (was cyan)
  light: '#F4F5F6', // highlights and text
  string: '#DADDE0', // harp strings
  lobbyTop: '#24282D', // the song picker's space, overhead
  lobbyBottom: '#0B0C0E', // and below
} as const;
