/* transcript.js */
const Transcript = (() => { 'use strict'; let e=[]; return { add(w,t){e.push({who:w,text:t,time:Date.now()})}, getAll(){return[...e]}, clear(){e=[]} }; })();
