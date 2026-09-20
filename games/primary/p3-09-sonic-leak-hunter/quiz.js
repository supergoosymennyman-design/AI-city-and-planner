/**
 * quiz.js — Quiz data and scoring for Sonic Leak Hunter (Level 6)
 * 
 * 10 multiple-choice questions from the PLAN.md, each with:
 * - question text
 * - 3 choices (A, B, C)
 * - correct index
 * - AI concept tag
 * - Tip/explanation for wrong answers
 */

const Quiz = (() => {
  const questions = [
    {
      id: 1,
      text: "What did Piper need to LEARN what a leak sounds like?",
      choices: [
        { text: "Examples of safe sounds and leak sounds", correct: true },
        { text: "A new microphone", correct: false },
        { text: "A faster computer", correct: false }
      ],
      concept: "Training Data",
      tip: "AI needs labeled examples to learn from — just like you learned what a leak sounds like by seeing examples!"
    },
    {
      id: 2,
      text: "After training, how does Piper decide if a sound is a leak?",
      choices: [
        { text: "It guesses randomly", correct: false },
        { text: "It makes a new sound", correct: false },
        { text: "It compares the sound to the examples it learned", correct: true }
      ],
      concept: "Classification",
      tip: "Classification means comparing new things to patterns you already know."
    },
    {
      id: 3,
      text: "Why did small wiggles in the waves make Piper confused?",
      choices: [
        { text: "They look a bit like small leaks even though they're not", correct: true },
        { text: "Piper was broken", correct: false },
        { text: "The city was too quiet", correct: false }
      ],
      concept: "Noise / Signal Filtering",
      tip: "Noise is random data that can fool AI. Filtering separates the real signal from the noise."
    },
    {
      id: 4,
      text: "What happens if Piper's sensitivity is set too HIGH?",
      choices: [
        { text: "Piper finds NO leaks", correct: false },
        { text: "Piper goes to sleep", correct: false },
        { text: "Piper finds real leaks but also many false alarms", correct: true }
      ],
      concept: "Threshold / False Positives",
      tip: "Too sensitive = too many false alarms (false positives). Balance is key!"
    },
    {
      id: 5,
      text: "What happens if Piper's sensitivity is set too LOW?",
      choices: [
        { text: "Piper misses real leaks", correct: true },
        { text: "Piper works twice as fast", correct: false },
        { text: "Piper sounds louder", correct: false }
      ],
      concept: "Threshold / False Negatives",
      tip: "Too low sensitivity = missing real leaks (false negatives). That's dangerous!"
    },
    {
      id: 6,
      text: "When Piper says 'I'm only 55% certain,' what should happen?",
      choices: [
        { text: "Ignore it, Piper is an AI", correct: false },
        { text: "Panic", correct: false },
        { text: "A human should check that block themselves", correct: true }
      ],
      concept: "Confidence / Human-in-the-Loop",
      tip: "When AI is uncertain, a human should step in. That's Human-in-the-Loop!"
    },
    {
      id: 7,
      text: "Why couldn't Piper find leaks on its own at the very start?",
      choices: [
        { text: "The battery was dead", correct: false },
        { text: "Piper had no labeled examples to learn from", correct: true },
        { text: "The pipes were new", correct: false }
      ],
      concept: "Supervised Learning",
      tip: "Without training data, AI can't learn patterns. Supervised learning provides the examples."
    },
    {
      id: 8,
      text: "Can Piper perfectly detect a leak in a type of pipe it has NEVER heard before?",
      choices: [
        { text: "Yes, AI is perfect", correct: false },
        { text: "No, AI never works", correct: false },
        { text: "Maybe, but it might be wrong because it wasn't trained on that sound", correct: true }
      ],
      concept: "Generalization",
      tip: "AI works best on things it was trained on. New situations may need new training data."
    },
    {
      id: 9,
      text: "Why does Piper ask a human to check uncertain blocks?",
      choices: [
        { text: "Piper is shy", correct: false },
        { text: "Humans make no mistakes", correct: false },
        { text: "AI can be uncertain, and humans can use their judgment to help", correct: true }
      ],
      concept: "Human-in-the-Loop",
      tip: "AI + human judgment = better than either alone. That's the core of Human-in-the-Loop!"
    },
    {
      id: 10,
      text: "A real water company wants to use AI to find leaks. What do they need MOST?",
      choices: [
        { text: "A big computer", correct: false },
        { text: "A red pipe", correct: false },
        { text: "Examples of leak sounds so the AI can learn from them", correct: true }
      ],
      concept: "Real-world AI",
      tip: "Training data is the most important ingredient for any real-world AI system."
    }
  ];

  /**
   * Get a question by index (0-based)
   */
  function getQuestion(index) {
    if (index < 0 || index >= questions.length) return null;
    return { ...questions[index], answered: false, selectedChoice: null, _lastCorrect: null };
  }

  /**
   * Get all questions
   */
  function getAllQuestions() {
    return questions.map(q => ({ ...q, answered: false, selectedChoice: null, _lastCorrect: null }));
  }

  /**
   * Check an answer, return { correct: bool, concept: string, tip: string }
   */
  function checkAnswer(question, choiceIndex) {
    const correct = question.choices[choiceIndex]?.correct || false;
    return {
      correct,
      concept: question.concept,
      tip: question.tip,
      correctIndex: question.choices.findIndex(c => c.correct)
    };
  }

  /**
   * Calculate final score and pass/fail
   */
  function getResults(answers) {
    const score = answers.filter(a => a.correct).length;
    const total = questions.length;
    const passed = score >= 7;
    
    return {
      score,
      total,
      passed,
      percentage: Math.round((score / total) * 100),
      concepts: questions.map(q => q.concept)
    };
  }

  return {
    questions,
    getQuestion,
    getAllQuestions,
    checkAnswer,
    getResults
  };
})();

window.Quiz = Quiz;
