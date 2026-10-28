// Unit tests load saved fixture pages with Vite's `?raw` import (text only, never run).
declare module '*.html?raw' {
  const content: string;
  export default content;
}
