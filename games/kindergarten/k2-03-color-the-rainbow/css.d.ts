/**
 * Ambient declaration so `tsc` accepts side-effect CSS imports (`import './styles.css'`).
 * Vite handles the actual bundling; TypeScript just needs to know the module exists.
 * (Kept local + dependency-free rather than pulling in `vite/client` types.)
 */
declare module '*.css';
