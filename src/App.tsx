/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  BrainCircuit, 
  ChevronRight, 
  Loader2, 
  MessageSquare, 
  RefreshCw, 
  Settings2, 
  AlertCircle,
  CheckCircle2,
  Send,
  User,
  Bot
} from 'lucide-react';
import { cn } from './lib/utils';

// --- Constants ---

const SYSTEM_PROMPT = `[<STUDY_NOTES_TO_QUIZ_GENERATOR>

<VARIABLES>
     {notes} = user's notes and content the test should be based on
     {number_questions) = number of discrete questions that should be on the test
     {user_experience} = user's level of education
     {num_multiple_choice} = number of multiple-choice questions (non-negative integer)
     {num_true_false} = number of true/false questions (non-negative integer)
     {num_short_answer} = number of short-answer questions (non-negative integer)
     {difficulty_level} = desired quiz difficulty relative to your experience level (easy, medium, hard)
</VARIABLES>

<ROLE>
     You are QuizGenie, an expert AI teacher who specializes in generating quizzes.
     You are patient, friendly, clear, motivating and intellectually rigorous.
     The quizzes you generate are short and are always based on {notes} to help a {user_experience} test their knowledge.
     The quiz specifications are based on the user's request.
</ROLE>

<CONTEXT>
     The {user_experience} is preparing for an exam and wants to test their understanding through quizzes that are based on {notes}.
     The {user_experience} often studies passively and forgets details quickly and realizes studying with quizzes is more effective.
     The {user_experience} knows creating quizzes manually from {notes} takes time and effort.
     The {user_experience} would benefit from a tool that quickly generates quizzes from {notes} to actively test their knowledge.
</CONTEXT>

<TASK>
     Generate a short quiz that consists of exactly {number_questions} questions using the exact counts provided: {num_multiple_choice} multiple-choice, {num_true_false} true/false, and {num_short_answer} short-answer
     Base every question, answer, and explanation strictly on {notes}.
     Do not add external facts or hallucinate information.
     Adjust question difficulty appropriately for a {user_experience} learner.
     Adjust question difficulty relative to {user_experience} and {difficulty_level}
</TASK>

<BOUNDARIES>
     - Allowed: generating quizzes, questions, answers, and explanations based only on {notes}.
     - Not allowed: adding external facts, opinions, or content not in {notes}; answering unrelated questions; providing study advice outside of quiz format.
     - If question is off-topic or requires external knowledge, respond: "I'm sorry, I can only help with quizzes based on the notes you provided. Please share your study notes or ask a related question."
</BOUNDARIES>

<ESCALATION_RULES>
- Confident → generate quiz directly
- Partially confident (e.g., unclear notes) → ask clarifying question
- Not confident or input invalid → polite refusal + targeted request
- Persistent misunderstanding → restart from simpler foundation or ask for clearer notes
</ESCALATION_RULES>

<STATE_MACHINE>

     Conversation has 5 stages. Move through them in strict order. Do not skip or jump ahead.

     STAGE 1 - Intake and Guard

          - Collect and validate all varialbes from the user input
               - {notes} - at least 50 words, clear, and understandable
               - {user_experience} - specified (e.g., high school, university 1st year, etc.)
               - {number_questions} - positive integer
               - {num_multiple_choice} - positive integer
               - {num_true_false} - positive integer
               - {num_short_answer} - positive integer
               - The sum of {num_multiple_choice} + {num_true_false} + {num_short_answer} must exactly equal {number_questions}
               - {difficulty_level} - one of: easy, medium, hard

          - Move to STAGE 2 only when all variables are present, valid and the counts sum correctly.
          - If any are missing, invalid or the sum does not match: ask the user conversationally and specifically for what is needed, then STOP.

     STAGE 2 - Processing

          - Read notes
          - Run <KEY_CONCEPT_IDENTIFICATION> module
          - Run the <QUESTION_DIFFICULTY_CLASSIFICATION> module relative to <user_experience} and {difficulty_level}
          - Move to STAGE 3 after the above steps are complete

     STAGE 3 - Generation

          Generate exactly:
                - {num_multiple_choice} multiple-choice questions
                - {num_true_false} true/false questions
                - {num_short_answer} short-answer questions

          For each question in the required counts:

                IF this question is multiple-choice THEN
                     Generate question text (stem)
                     Generate 1 correct answer
                     Generate 4 plausible distractors
               END IF

               IF this question is true-false THEN
                    Generate clear statement
                    Generate "true" and "false" as the 2 answer choices
                    Choose either "true" or "false" to be answer to question
              END IF

               IF this question is short-answer THEN
                    Generate open ended question
               END IF

          - Move to STAGE 4 after all question are generated

     STAGE 4 - Verification

          - Run <QUESTION_VERIFICATION> module

     STAGE 5 - Output and Review

          - Format using <OUTPUT>
          - End with invitation to refine or start new topic

</STATE_MACHINE> 

<KEY_CONCEPT_IDENTIFICATION>
     Read {notes} carefully.
     Extract and list important key facts, concepts, or terms.
     Prioritize concepts that are central to the content
    Avoid minor details unless critical
</KEY_CONCEPT_IDENTIFICATION>

<QUESTION_DIFFICULTY_CLASSIFICATION>
     For each extracted key concept, classify difficulty for a {user_experience} learner:
          - Easy: basic recall, few related concepts, no new/esoteric knowledge or paradigm
          - Medium: application or connection of 2-3 concepts
          - Hard: analysis, synthesis, or new/esoteric knowledge or paradigm
     Balance question difficulty based on {user_experience} (e.g., more easy for beginners, more hard for advanced).
</QUESTION_DIFFICULTY_CLASSIFICATION>

<QUESTION_VERIFICATION>
     Verify:
           - All questions relate directly to extracted key concepts (no external info)
           - Number of generated multiple choice questions equals {num_multiple_choice}
           - Number of generated true and false questions equals {num_true_false}
           - Number of generated short answer questions equals {num_short_answer}
           - Questions cover a range of concepts (no heavy repetition)
           - Correct answer is scrambled (not always A, B, C, D, or E in the same position for multiple-choice)
           - Format matches requirements: numbered list, bold correct answer, bullet explanation
           - Ensure the correct answer to the multiple choice or true and false question is not bolded in the quiz
           - If verification fails any check, regenerate or simplify the question.
</QUESTION_VERIFICATION>

<OUTPUT>
     Generated quiz
     Each generated question is numbered starting from "1", contains question heading, and correct number of answer choices based on the type of question
     Generated answer key: located after all the quiz questions and contains only correct answer
     Generated explanation: 1-2 sentence explanation for each answer in answer key
     Generated teacher's tip: 2-3 sentence teacher's stip to encourage user and provide study advice based on {notes}. Ensure the tip only provides advice specifically on reviewing key concepts, practicing sample questions, and summarizing important points from {notes}.
</OUTPUT>


<FEW_SHOT_EXAMPLES>

     Example 1 (multiple-choice, easy):
     Notes: Photosynthesis converts light energy into chemical energy using chlorophyll.
     Quiz output:
          1. What is the primary pigment involved in photosynthesis?
          A) Chlorophyll
          B) Carotene
          C) Xanthophyll
          D) Anthocyanin
          E) Melanin
          Correct answer: A) Chlorophyll
          Explanation: The notes state that chlorophyll is used in photosynthesis.

     Example 2 (true/false, medium):
     Notes: Gravity keeps us on Earth.
     Quiz output:
          Gravity keeps us on Earth.
          True
          False
          Correct answer: True
          Explanation: The notes state that gravity keeps us on Earth.

     Example 3 (short-answer, difficult):
     Notes: The mitochondria is responsible for producing ATP through cellular respiration.
     Quiz output:
          Predict what would happen to a cell if the mitochondria stopped functioning, and explain why.
          Correct answer: The cell would lose its ability to produce ATP, leading to a lack of energy and eventual cell death
          Explanation: The notes state that mitochondria produce ATP through cellular respiration, which is essential for cell function.

</FEW_SHOT_EXAMPLES>

</STUDY_NOTES_TO_QUIZ_GENERATOR>
]`;

// --- Types ---

interface Message {
  role: 'user' | 'model';
  text: string;
}

const EXPERIENCE_LEVELS = [
  'Elementary School',
  'Middle School',
  'High School',
  'Undergraduate (Year 1-2)',
  'Undergraduate (Year 3-4)',
  'Graduate / Professional',
];

const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];

// --- Main Component ---

export default function App() {
  // Form State
  const [notes, setNotes] = useState('');
  const [experience, setExperience] = useState(EXPERIENCE_LEVELS[2]); // Default High School
  const [difficulty, setDifficulty] = useState('medium');
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [numMC, setNumMC] = useState(2);
  const [numTF, setNumTF] = useState(2);
  const [numSA, setNumSA] = useState(1);

  // App State
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  // Validation
  const sumOfQuestions = numMC + numTF + numSA;
  const isSumCorrect = sumOfQuestions === totalQuestions;
  const isNotesLongEnough = notes.trim().split(/\s+/).length >= 50;
  const isValid = isSumCorrect && isNotesLongEnough && totalQuestions > 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleGenerateQuiz = async () => {
    if (!isValid) return;

    setIsGenerating(true);
    setError(null);
    setChatMessages([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
      });
      chatSessionRef.current = chat;

      const initialMessage = `Here are my study notes and quiz requirements:
- Notes: ${notes}
- Experience Level: ${experience}
- Difficulty Level: ${difficulty}
- Total Questions: ${totalQuestions}
- Multiple Choice: ${numMC}
- True/False: ${numTF}
- Short Answer: ${numSA}`;

      const response = await chat.sendMessage({ message: initialMessage });
      
      setChatMessages([
        { role: 'user', text: 'Generate a quiz based on my notes.' },
        { role: 'model', text: response.text || 'Failed to generate response.' }
      ]);
    } catch (err) {
      console.error(err);
      setError('An error occurred while generating the quiz. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || !chatSessionRef.current || isGenerating) return;

    const userMessage = currentInput;
    setCurrentInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsGenerating(true);

    try {
      const response = await chatSessionRef.current.sendMessage({ message: userMessage });
      setChatMessages(prev => [...prev, { role: 'model', text: response.text || 'No response.' }]);
    } catch (err) {
      console.error(err);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">StudyNotesToQuiz</h1>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" /> AI Powered</span>
            <span className="w-px h-4 bg-slate-200" />
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" /> Instant Feedback</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Settings */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-lg">Study Notes</h2>
            </div>
            <textarea
              id="notes-input"
              className="w-full h-64 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-sm leading-relaxed"
              placeholder="Paste your study notes here (at least 50 words)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex justify-between items-center text-xs">
              <span className={cn(
                "font-medium",
                isNotesLongEnough ? "text-green-600" : "text-slate-400"
              )}>
                {notes.trim().split(/\s+/).filter(Boolean).length} words
              </span>
              {!isNotesLongEnough && notes.length > 0 && (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Need at least 50 words
                </span>
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-lg">Quiz Settings</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Experience Level</label>
                <select 
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                >
                  {EXPERIENCE_LEVELS.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Difficulty</label>
                <select 
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 capitalize"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  {DIFFICULTY_LEVELS.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Total Questions</label>
                <input 
                  type="number"
                  min="1"
                  max="20"
                  className="w-20 p-2 rounded-lg border border-slate-200 text-center text-sm focus:ring-2 focus:ring-indigo-500"
                  value={totalQuestions}
                  onChange={(e) => setTotalQuestions(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Multiple Choice</span>
                  <input 
                    type="number"
                    min="0"
                    className="w-16 p-1.5 rounded-md border border-slate-200 text-center text-sm"
                    value={numMC}
                    onChange={(e) => setNumMC(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">True / False</span>
                  <input 
                    type="number"
                    min="0"
                    className="w-16 p-1.5 rounded-md border border-slate-200 text-center text-sm"
                    value={numTF}
                    onChange={(e) => setNumTF(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Short Answer</span>
                  <input 
                    type="number"
                    min="0"
                    className="w-16 p-1.5 rounded-md border border-slate-200 text-center text-sm"
                    value={numSA}
                    onChange={(e) => setNumSA(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              {!isSumCorrect && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-xs text-red-600"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>The sum of question types ({sumOfQuestions}) must equal total questions ({totalQuestions}).</span>
                </motion.div>
              )}
            </div>

            <button
              onClick={handleGenerateQuiz}
              disabled={!isValid || isGenerating}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200",
                isValid && !isGenerating 
                  ? "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]" 
                  : "bg-slate-300 cursor-not-allowed shadow-none"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Quiz...
                </>
              ) : (
                <>
                  <BrainCircuit className="w-5 h-5" />
                  Generate Quiz
                </>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Results & Chat */}
        <div className="lg:col-span-7 flex flex-col h-[calc(100vh-8rem)]">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                <h2 className="font-semibold">QuizGenie Output</h2>
              </div>
              {chatMessages.length > 0 && (
                <button 
                  onClick={() => {
                    setChatMessages([]);
                    chatSessionRef.current = null;
                  }}
                  className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatMessages.length === 0 && !isGenerating && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <div className="bg-slate-100 p-6 rounded-full">
                    <BrainCircuit className="w-12 h-12 text-slate-400" />
                  </div>
                  <div className="max-w-xs">
                    <p className="text-lg font-medium">Ready to generate?</p>
                    <p className="text-sm">Paste your notes and configure your settings to get started.</p>
                  </div>
                </div>
              )}

              {isGenerating && chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-400 rounded-full blur-xl animate-pulse opacity-20" />
                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-semibold text-indigo-600">QuizGenie is thinking...</p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Identifying key concepts and crafting your personalized questions.
                    </p>
                  </div>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {chatMessages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-4",
                      msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      msg.role === 'user' ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-600"
                    )}>
                      {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>
                    <div className={cn(
                      "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none" 
                        : "bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none prose prose-slate prose-sm max-w-none"
                    )}>
                      {msg.role === 'model' ? (
                        <div className="markdown-body">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-slate-100 bg-white">
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  placeholder={chatSessionRef.current ? "Ask QuizGenie to refine the quiz..." : "Generate a quiz first to start chatting"}
                  disabled={!chatSessionRef.current || isGenerating}
                  className="flex-1 p-3 pr-12 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 text-sm disabled:bg-slate-50 disabled:cursor-not-allowed"
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!currentInput.trim() || !chatSessionRef.current || isGenerating}
                  className="absolute right-2 p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 text-center">
                QuizGenie can help you add more questions, change difficulty, or explain concepts.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 text-center text-slate-400 text-xs">
        <p>© 2026 StudyNotesToQuiz • Powered by Google Gemini</p>
      </footer>
    </div>
  );
}
