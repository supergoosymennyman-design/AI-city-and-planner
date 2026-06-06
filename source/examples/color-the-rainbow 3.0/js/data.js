var PALETTE = [
  {name:'Red',   hex:'#FF4444', rgb:[255,68,68]},
  {name:'Blue',  hex:'#4488FF', rgb:[68,136,255]},
  {name:'Yellow',hex:'#F5D742', rgb:[245,215,66]},
  {name:'Green', hex:'#3DBB5A', rgb:[61,187,90]},
  {name:'Orange',hex:'#FF8C2B', rgb:[255,140,43]},
  {name:'Purple',hex:'#9B4DFF', rgb:[155,77,255]}
];

var COLOURS = ['red','blue','yellow'];
var SHAPES  = ['circle','square','triangle'];
var COLOUR_NAMES = {red:'Red',blue:'Blue',yellow:'Yellow'};
var TOTAL_ROUNDS = 5;
var SIMILARITY_THRESHOLD = 30;
var COLOR_ASSOCIATIONS = {red:'Like an apple!', blue:'Like the sky!', yellow:'Like the sun!'};
var TEACHING_HEXES = {'#FF4444':'red', '#4488FF':'blue', '#F5D742':'yellow'};

function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}

function pickEnglishVoice(){
  if(!window.speechSynthesis) return null;
  var voices=window.speechSynthesis.getVoices();
  for(var i=0;i<voices.length;i++){if(voices[i].lang.startsWith('en')) return voices[i]}
  return null
}

var CORRECT_PHRASES = ['Awesome!','Well done!','Great job!','Super!','Amazing!','Fantastic!','You got it!','Brilliant!'];
var WRONG_PHRASES = ['Try again!','Almost!','Not quite!','Keep going!','Good try!','So close!','Don\u2019t give up!','Nice effort!'];

function shuffle(a){
  for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t}
  return a
}

function freshData(){
  var learned = {};
  COLOURS.forEach(function(c,i){learned[c]={rgb:null,shape:SHAPES[i%SHAPES.length],label:c}});
  return {
    state:'intro',learned:learned,
    selectedColour:null,shapeFilled:false,
    taughtCount:0,
    gameRound:0,gameScore:0,gameFeedback:null,gamePick:null,gameShape:null,phraseIndex:0
  }
}
