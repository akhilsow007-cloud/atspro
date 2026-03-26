/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { 
  FileText, 
  Briefcase, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Layout,
  User,
  ArrowRight,
  Sparkles,
  Target,
  Upload,
  FileUp,
  ChevronRight,
  ChevronLeft,
  MapPin,
  DollarSign,
  Award,
  TrendingUp,
  Search,
  Check,
  X,
  Info
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Profile {
  cvText: string;
  yearsOfExperience: string;
  currentRole: string;
  targetLevel: string;
  industries: string;
  location: string;
  expectedCTC: string;
  keySkills: string;
  careerGoals: string;
}

interface AnalysisReport {
  overallScore: number;
  verdict: string;
  verdictColor: 'green' | 'yellow' | 'red';
  dimensions: {
    experience: number;
    skills: number;
    industryFit: number;
    seniority: number;
    careerGoals: number;
  };
  strengths: {
    title: string;
    impact: string;
  }[];
  gaps: {
    title: string;
    rating: 'High' | 'Medium' | 'Low';
    mitigation: string;
  }[];
  keywords: {
    word: string;
    present: boolean;
  }[];
  nextSteps: string[];
}

interface ATSReport {
  atsScore: number;
  formatting: { score: number; feedback: string };
  keywords: { score: number; missing: string[]; present: string[] };
  impact: { score: number; feedback: string };
  structure: { score: number; feedback: string };
  recommendations: string[];
  optimizedSummary: string;
  rewrittenCV: string;
  changesMade: string[];
}

export default function App() {
  const [appMode, setAppMode] = useState<'suitability' | 'ats'>('suitability');
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({
    cvText: '',
    yearsOfExperience: '',
    currentRole: '',
    targetLevel: '',
    industries: '',
    location: '',
    expectedCTC: '',
    keySkills: '',
    careerGoals: '',
  });
  const [jdText, setJdText] = useState('');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [atsReport, setAtsReport] = useState<ATSReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setError('');

    try {
      const fileType = file.type;
      const fileName = file.name.toLowerCase();

      let extractedText = '';
      if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
        extractedText = await file.text();
      } else {
        throw new Error("Unsupported file format. Please upload PDF, DOCX, or TXT.");
      }

      if (!extractedText.trim()) throw new Error("File seems empty or unreadable.");
      
      // Extract profile info from CV text
      const model = "gemini-3-flash-preview";
      const extractionPrompt = `
        Extract professional profile details from the following CV text.
        Return ONLY a JSON object with these fields:
        {
          "yearsOfExperience": "string",
          "currentRole": "string",
          "targetLevel": "string (infer based on experience and role)",
          "industries": "string (comma separated)",
          "location": "string",
          "keySkills": "string (comma separated)",
          "careerGoals": "string (infer from summary or experience)"
        }
        
        CV TEXT:
        ${extractedText.substring(0, 10000)}
      `;

      const response = await genAI.models.generateContent({
        model,
        contents: [{ parts: [{ text: extractionPrompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const extractedData = JSON.parse(response.text || "{}");
      
      setProfile(prev => ({ 
        ...prev, 
        cvText: extractedText,
        yearsOfExperience: extractedData.yearsOfExperience || prev.yearsOfExperience,
        currentRole: extractedData.currentRole || prev.currentRole,
        targetLevel: extractedData.targetLevel || prev.targetLevel,
        industries: extractedData.industries || prev.industries,
        location: extractedData.location || prev.location,
        keySkills: extractedData.keySkills || prev.keySkills,
        careerGoals: extractedData.careerGoals || prev.careerGoals,
      }));
    } catch (err: any) {
      setError(err.message || "Failed to parse file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (appMode === 'suitability' && (!profile.cvText || !jdText)) {
      setError("Please provide both your CV/Profile and the Job Description.");
      return;
    }
    if (appMode === 'ats' && !profile.cvText) {
      setError("Please upload your CV first.");
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const model = "gemini-3-flash-preview";
      
      if (appMode === 'suitability') {
        const prompt = `
          Analyze the suitability of a candidate for a specific job.
          
          CANDIDATE PROFILE:
          - CV Text: ${profile.cvText}
          - Years of Experience: ${profile.yearsOfExperience}
          - Current Role: ${profile.currentRole}
          - Target Level: ${profile.targetLevel}
          - Industries: ${profile.industries}
          - Location: ${profile.location}
          - Expected CTC: ${profile.expectedCTC}
          - Key Skills: ${profile.keySkills}
          - Career Goals: ${profile.careerGoals}
          
          JOB DESCRIPTION:
          ${jdText}
          
          TASK:
          Provide a detailed suitability report in JSON format.
          The JSON must strictly follow this structure:
          {
            "overallScore": number (0-100),
            "verdict": "string (Short summary verdict)",
            "verdictColor": "green" | "yellow" | "red",
            "dimensions": {
              "experience": number (0-100),
              "skills": number (0-100),
              "industryFit": number (0-100),
              "seniority": number (0-100),
              "careerGoals": number (0-100)
            },
            "strengths": [
              { "title": "string", "impact": "string (explanation of why this matters)" }
            ],
            "gaps": [
              { "title": "string", "rating": "High" | "Medium" | "Low", "mitigation": "string (how to address)" }
            ],
            "keywords": [
              { "word": "string", "present": boolean }
            ],
            "nextSteps": ["string (actionable recommendation)"]
          }
        `;

        const response = await genAI.models.generateContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const result = JSON.parse(response.text || "{}");
        setReport(result);
        setStep(3);
      } else {
        // ATS CV Pro Mode
        const prompt = `
          Analyze this CV for ATS (Applicant Tracking System) compatibility and rewrite it to perfectly match the provided Job Description while maintaining the original structure and professional integrity.
          
          CV TEXT:
          ${profile.cvText}

          JOB DESCRIPTION:
          ${jdText}
          
          TASK:
          1. Analyze the CV against the JD for keyword match and formatting.
          2. Rewrite the CV text to better align with the JD requirements (incorporate missing keywords, emphasize relevant experience).
          3. List the specific changes made to the CV.
          
          Return a detailed ATS optimization report in JSON format.
          The JSON must strictly follow this structure:
          {
            "atsScore": number (0-100),
            "formatting": { "score": number, "feedback": "string" },
            "keywords": { "score": number, "missing": ["string"], "present": ["string"] },
            "impact": { "score": number, "feedback": "string (focus on quantifiable achievements)" },
            "structure": { "score": number, "feedback": "string" },
            "recommendations": ["string (specific improvement)"],
            "optimizedSummary": "string (a professionally rewritten summary/objective)",
            "rewrittenCV": "string (the full rewritten CV text, preserving original sections)",
            "changesMade": ["string (description of a specific change made)"]
          }
        `;

        const response = await genAI.models.generateContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const result = JSON.parse(response.text || "{}");
        setAtsReport(result);
        setStep(3);
      }
    } catch (err) {
      setError("Analysis failed. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    
    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    const fileName = appMode === 'suitability' ? 'Job_Suitability_Report.pdf' : 'ATS_Optimization_Report.pdf';
    pdf.save(fileName);
  };

  const renderStep0 = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-12 py-12"
    >
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black tracking-tight text-zinc-900">Choose Your Tool</h1>
        <p className="text-zinc-500 text-lg max-w-2xl mx-auto">
          Whether you're checking your fit for a specific role or optimizing your CV for machine readers, we've got you covered.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <button
          onClick={() => { setAppMode('suitability'); setStep(1); }}
          className="group relative p-8 rounded-[40px] bg-white border border-zinc-100 shadow-sm hover:shadow-xl hover:border-zinc-200 transition-all text-left space-y-6 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Target className="w-32 h-32 text-zinc-900" />
          </div>
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/20">
            <Target className="text-white w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900">Job Suitability Analyzer</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Compare your profile against a specific job description. Get a detailed fit score, strengths, and gap analysis.
            </p>
          </div>
          <div className="flex items-center gap-2 text-zinc-900 font-bold text-sm">
            Start Analysis <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        <button
          onClick={() => { setAppMode('ats'); setStep(1); }}
          className="group relative p-8 rounded-[40px] bg-white border border-zinc-100 shadow-sm hover:shadow-xl hover:border-zinc-200 transition-all text-left space-y-6 overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Sparkles className="w-32 h-32 text-zinc-900" />
          </div>
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/20">
            <Sparkles className="text-white w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900">ATS CV Pro</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Optimize your CV for Applicant Tracking Systems. Improve formatting, keyword density, and overall machine readability.
            </p>
          </div>
          <div className="flex items-center gap-2 text-zinc-900 font-bold text-sm">
            Optimize CV <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-zinc-100">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">AI-Powered Analysis</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Export to PDF</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
            <Layout className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Actionable Reports</p>
        </div>
      </div>
    </motion.div>
  );

  const renderStep1 = () => (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <button
          onClick={() => { setAppMode('suitability'); }}
          className={cn(
            "flex-1 p-6 rounded-[32px] border-2 transition-all text-left group",
            appMode === 'suitability' 
              ? "border-zinc-900 bg-zinc-900 text-white shadow-xl shadow-zinc-900/20" 
              : "border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200"
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              appMode === 'suitability' ? "bg-white/10" : "bg-zinc-100"
            )}>
              <Target className={cn("w-6 h-6", appMode === 'suitability' ? "text-white" : "text-zinc-900")} />
            </div>
            {appMode === 'suitability' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          </div>
          <h3 className="text-lg font-bold mb-1">Job Suitability</h3>
          <p className="text-xs opacity-70">Compare your profile against a specific job description.</p>
        </button>

        <button
          onClick={() => { setAppMode('ats'); }}
          className={cn(
            "flex-1 p-6 rounded-[32px] border-2 transition-all text-left group",
            appMode === 'ats' 
              ? "border-zinc-900 bg-zinc-900 text-white shadow-xl shadow-zinc-900/20" 
              : "border-zinc-100 bg-white text-zinc-500 hover:border-zinc-200"
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              appMode === 'ats' ? "bg-white/10" : "bg-zinc-100"
            )}>
              <Sparkles className={cn("w-6 h-6", appMode === 'ats' ? "text-white" : "text-zinc-900")} />
            </div>
            {appMode === 'ats' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          </div>
          <h3 className="text-lg font-bold mb-1">ATS CV Pro</h3>
          <p className="text-xs opacity-70">Optimize your CV for Applicant Tracking Systems.</p>
        </button>
      </div>

      <div className="bg-white p-8 rounded-[32px] shadow-sm border border-zinc-100">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
              {appMode === 'suitability' ? 'Candidate Profile' : 'CV Optimization'}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              {appMode === 'suitability' 
                ? 'Upload your CV and fill in your professional details.' 
                : 'Upload your CV to analyze and optimize for ATS.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="px-4 py-2 text-sm font-medium text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-all flex items-center gap-2 border border-zinc-200 disabled:opacity-50"
            >
              {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {profile.cvText ? 'Update CV' : 'Upload CV'}
            </button>
          </div>
        </div>

        {appMode === 'suitability' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Award className="w-3 h-3" /> Years of Experience
              </label>
              <input
                type="text"
                value={profile.yearsOfExperience}
                onChange={(e) => setProfile(prev => ({ ...prev, yearsOfExperience: e.target.value }))}
                placeholder="e.g. 5 years"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Briefcase className="w-3 h-3" /> Current Role
              </label>
              <input
                type="text"
                value={profile.currentRole}
                onChange={(e) => setProfile(prev => ({ ...prev, currentRole: e.target.value }))}
                placeholder="e.g. Senior Developer"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" /> Target Level
              </label>
              <input
                type="text"
                value={profile.targetLevel}
                onChange={(e) => setProfile(prev => ({ ...prev, targetLevel: e.target.value }))}
                placeholder="e.g. Tech Lead"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Layout className="w-3 h-3" /> Industries
              </label>
              <input
                type="text"
                value={profile.industries}
                onChange={(e) => setProfile(prev => ({ ...prev, industries: e.target.value }))}
                placeholder="e.g. Fintech, E-commerce"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Location
              </label>
              <input
                type="text"
                value={profile.location}
                onChange={(e) => setProfile(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g. Remote / New York"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <DollarSign className="w-3 h-3" /> Expected CTC
              </label>
              <input
                type="text"
                value={profile.expectedCTC}
                onChange={(e) => setProfile(prev => ({ ...prev, expectedCTC: e.target.value }))}
                placeholder="e.g. $150k"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Key Skills
              </label>
              <textarea
                value={profile.keySkills}
                onChange={(e) => setProfile(prev => ({ ...prev, keySkills: e.target.value }))}
                placeholder="List your top skills..."
                className="w-full h-24 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all resize-none"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Target className="w-3 h-3" /> Career Goals
              </label>
              <textarea
                value={profile.careerGoals}
                onChange={(e) => setProfile(prev => ({ ...prev, careerGoals: e.target.value }))}
                placeholder="What are you looking for in your next role?"
                className="w-full h-24 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-12 border-2 border-dashed border-zinc-100 rounded-[32px] flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center">
                <FileUp className="w-8 h-8 text-zinc-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {profile.cvText ? 'CV Uploaded' : 'Drop your CV here'}
                </h3>
                <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                  {profile.cvText 
                    ? 'Your CV is ready for optimization. Click the button below to start.' 
                    : 'We support PDF, DOCX and TXT formats for ATS analysis.'}
                </p>
              </div>
              {!profile.cvText && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all"
                >
                  Select File
                </button>
              )}
            </div>
            {profile.cvText && (
              <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">CV Preview</h4>
                  <span className="text-[10px] font-bold text-zinc-400">{profile.cvText.length} characters</span>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-6 leading-relaxed italic">
                  {profile.cvText}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => setStep(2)}
            className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-xl shadow-zinc-900/10"
          >
            Next: Job Description <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="bg-white p-8 rounded-[32px] shadow-sm border border-zinc-100">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Job Description</h2>
          <p className="text-zinc-500 text-sm mt-1">Paste the job description you want to analyze against.</p>
        </div>

        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste the full JD here..."
          className="w-full h-96 px-6 py-6 bg-zinc-50 border border-zinc-200 rounded-[24px] focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all resize-none text-sm leading-relaxed"
        />

          <div className="mt-8 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-4 text-zinc-600 font-semibold hover:text-zinc-900 transition-all flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Profile
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isLoading || !jdText}
              className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-xl shadow-zinc-900/10 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> {appMode === 'suitability' ? 'Analyzing...' : 'Optimizing...'}
                </>
              ) : (
                <>
                  {appMode === 'suitability' ? 'Analyze Suitability' : 'Optimize CV'} <Sparkles className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
      </div>
    </motion.div>
  );

  const handleReset = (keepCV = false) => {
    if (!keepCV) {
      setStep(0);
      setProfile({
        cvText: '',
        yearsOfExperience: '',
        currentRole: '',
        targetLevel: '',
        industries: '',
        location: '',
        expectedCTC: '',
        keySkills: '',
        careerGoals: '',
      });
      setJdText('');
    } else {
      setStep(1);
    }
    setReport(null);
    setAtsReport(null);
    setError('');
  };

  const copyToClipboard = () => {
    if (appMode === 'suitability' && report) {
      const text = `
Suitability Report: ${report.overallScore}% - ${report.verdict}

Why You're a Fit:
${report.strengths.map(s => `- ${s.title}: ${s.impact}`).join('\n')}

Gaps to Address:
${report.gaps.map(g => `- ${g.title} (${g.rating} Priority): ${g.mitigation}`).join('\n')}

Next Steps:
${report.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
      `.trim();
      navigator.clipboard.writeText(text);
      alert("Report copied to clipboard!");
    } else if (appMode === 'ats' && atsReport) {
      const text = `
ATS CV Pro Report: ${atsReport.atsScore}%

Formatting: ${atsReport.formatting.score}% - ${atsReport.formatting.feedback}
Structure: ${atsReport.structure.score}% - ${atsReport.structure.feedback}
Impact: ${atsReport.impact.score}% - ${atsReport.impact.feedback}

Recommendations:
${atsReport.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Optimized Summary:
${atsReport.optimizedSummary}
      `.trim();
      navigator.clipboard.writeText(text);
      alert("Report copied to clipboard!");
    }
  };

  const renderStep3 = () => {
    if (appMode === 'suitability') {
      if (!report) return null;

      const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
        if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-100';
        return 'text-rose-600 bg-rose-50 border-rose-100';
      };

      const getBarColor = (score: number) => {
        if (score >= 80) return 'bg-emerald-500';
        if (score >= 60) return 'bg-amber-500';
        return 'bg-rose-500';
      };

      return (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-zinc-600 font-semibold hover:text-zinc-900 transition-all flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" /> Edit JD
              </button>
              <div className="flex gap-3">
                <button
                  onClick={copyToClipboard}
                  className="px-6 py-3 bg-zinc-100 text-zinc-900 rounded-xl font-semibold hover:bg-zinc-200 transition-all flex items-center gap-2"
                >
                  <Layout className="w-4 h-4" /> Copy Text
                </button>
                <button
                  onClick={exportToPDF}
                  className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-lg shadow-zinc-900/10"
                >
                  <Download className="w-4 h-4" /> Save as PDF
                </button>
              </div>
            </div>

          <div ref={reportRef} className="bg-white p-12 rounded-[40px] shadow-xl border border-zinc-100 space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-12 border-bottom border-zinc-100">
              <div className="space-y-2">
                <h1 className="text-4xl font-black tracking-tight text-zinc-900">Suitability Report</h1>
                <p className="text-zinc-500 font-medium">Analysis for {profile.currentRole || 'Candidate'}</p>
              </div>
              <div className={cn(
                "px-8 py-6 rounded-3xl border flex flex-col items-center justify-center text-center min-w-[200px]",
                getScoreColor(report.overallScore)
              )}>
                <span className="text-5xl font-black">{report.overallScore}%</span>
                <span className="text-xs font-bold uppercase tracking-widest mt-2">{report.verdict}</span>
              </div>
            </div>

            {/* Dimension Bars */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Suitability Dimensions</h3>
                <div className="space-y-6">
                  {Object.entries(report.dimensions).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex justify-between text-sm font-bold text-zinc-700 capitalize">
                        <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span>{value}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${value}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={cn("h-full rounded-full", getBarColor(value))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Keyword Match</h3>
                <div className="flex flex-wrap gap-3">
                  {report.keywords.map((kw, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all",
                        kw.present 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      )}
                    >
                      {kw.present ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {kw.word}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-12 border-t border-zinc-100">
              {/* Strengths */}
              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" /> Why You're a Fit
                </h3>
                <div className="space-y-6">
                  {report.strengths.map((s, i) => (
                    <div key={i} className="group">
                      <h4 className="text-lg font-bold text-zinc-900 mb-1 group-hover:text-emerald-600 transition-colors">{s.title}</h4>
                      <p className="text-zinc-600 text-sm leading-relaxed">{s.impact}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gaps */}
              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" /> Gaps to Address
                </h3>
                <div className="space-y-6">
                  {report.gaps.map((g, i) => (
                    <div key={i} className="p-6 bg-zinc-50 rounded-3xl border border-zinc-100 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-zinc-900">{g.title}</h4>
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter",
                          g.rating === 'High' ? 'bg-rose-100 text-rose-700' : 
                          g.rating === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                          'bg-blue-100 text-blue-700'
                        )}>
                          {g.rating} Priority
                        </span>
                      </div>
                      <p className="text-zinc-600 text-xs leading-relaxed italic">
                        <span className="font-bold text-zinc-400 not-italic mr-1">Mitigation:</span> {g.mitigation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="pt-12 border-t border-zinc-100">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 mb-8">Actionable Next Steps</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.nextSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-4 p-5 bg-zinc-900 text-white rounded-2xl">
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-12 border-t border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center md:text-left">
                <h4 className="text-sm font-bold text-zinc-900">Need to optimize your CV for ATS?</h4>
                <p className="text-xs text-zinc-500">Use our ATS CV Pro tool to improve your machine readability.</p>
              </div>
              <button
                onClick={() => { setAppMode('ats'); setStep(1); }}
                className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                Try ATS CV Pro <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </motion.div>
      );
    } else {
      // ATS CV Pro Report
      if (!atsReport) return null;

      const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
        if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-100';
        return 'text-rose-600 bg-rose-50 border-rose-100';
      };

      return (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="flex justify-between items-center">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-zinc-600 font-semibold hover:text-zinc-900 transition-all flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Edit CV
            </button>
            <div className="flex gap-3">
              <button
                onClick={copyToClipboard}
                className="px-6 py-3 bg-zinc-100 text-zinc-900 rounded-xl font-semibold hover:bg-zinc-200 transition-all flex items-center gap-2"
              >
                <Layout className="w-4 h-4" /> Copy Text
              </button>
              <button
                onClick={exportToPDF}
                className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-lg shadow-zinc-900/10"
              >
                <Download className="w-4 h-4" /> Save as PDF
              </button>
            </div>
          </div>

          <div ref={reportRef} className="bg-white p-12 rounded-[40px] shadow-xl border border-zinc-100 space-y-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-12 border-bottom border-zinc-100">
              <div className="space-y-2">
                <h1 className="text-4xl font-black tracking-tight text-zinc-900">ATS Optimization Report</h1>
                <p className="text-zinc-500 font-medium">Professional CV Audit</p>
              </div>
              <div className={cn(
                "px-8 py-6 rounded-3xl border flex flex-col items-center justify-center text-center min-w-[200px]",
                getScoreColor(atsReport.atsScore)
              )}>
                <span className="text-5xl font-black">{atsReport.atsScore}%</span>
                <span className="text-xs font-bold uppercase tracking-widest mt-2">ATS Score</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Formatting', score: atsReport.formatting.score, feedback: atsReport.formatting.feedback },
                { label: 'Keywords', score: atsReport.keywords.score, feedback: `${atsReport.keywords.present.length} keywords found, ${atsReport.keywords.missing.length} missing.` },
                { label: 'Impact', score: atsReport.impact.score, feedback: atsReport.impact.feedback },
                { label: 'Structure', score: atsReport.structure.score, feedback: atsReport.structure.feedback }
              ].map((item, i) => (
                <div key={i} className="p-6 bg-zinc-50 rounded-3xl border border-zinc-100 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{item.label}</span>
                    <span className={cn("text-lg font-black", getScoreColor(item.score).split(' ')[0])}>{item.score}%</span>
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">{item.feedback}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-12 border-t border-zinc-100">
              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Key Recommendations</h3>
                <div className="space-y-4">
                  {atsReport.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-sm font-medium text-zinc-700">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Optimized Summary</h3>
                <div className="p-8 bg-zinc-900 text-white rounded-[32px] relative overflow-hidden group">
                  <Sparkles className="absolute top-4 right-4 w-6 h-6 text-white/10 group-hover:text-white/30 transition-all" />
                  <p className="text-sm leading-relaxed font-medium italic">"{atsReport.optimizedSummary}"</p>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(atsReport.optimizedSummary);
                      alert("Summary copied!");
                    }}
                    className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Copy Summary
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-12 border-t border-zinc-100">
              <div className="space-y-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Changes Made to Match JD</h3>
                <div className="space-y-3">
                  {atsReport.changesMade.map((change, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-xs font-medium text-emerald-800">{change}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Rewritten CV</h3>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(atsReport.rewrittenCV);
                      alert("Rewritten CV copied!");
                    }}
                    className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                  >
                    <Layout className="w-3 h-3" /> Copy CV
                  </button>
                </div>
                <div className="p-6 bg-zinc-50 rounded-[32px] border border-zinc-100 max-h-[400px] overflow-y-auto">
                  <pre className="text-[10px] text-zinc-600 font-mono whitespace-pre-wrap leading-relaxed">
                    {atsReport.rewrittenCV}
                  </pre>
                </div>
              </div>
            </div>

            <div className="pt-12 border-t border-zinc-100">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 mb-6">Keyword Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Present Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {atsReport.keywords.present.map((kw, i) => (
                      <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-100">{kw}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-rose-600 uppercase tracking-widest">Missing Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {atsReport.keywords.missing.map((kw, i) => (
                      <span key={i} className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-100">{kw}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-12 border-t border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center md:text-left">
                <h4 className="text-sm font-bold text-zinc-900">Want to check your fit for a specific job?</h4>
                <p className="text-xs text-zinc-500">Use our Suitability Analyzer to compare your CV against a JD.</p>
              </div>
              <button
                onClick={() => { setAppMode('suitability'); setStep(1); }}
                className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all flex items-center gap-2"
              >
                Try Suitability Analyzer <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </motion.div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleReset(false)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              Home
            </button>
            <div className="w-10 h-10 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/20">
              {step === 0 ? <Layout className="text-white w-5 h-5" /> : (appMode === 'suitability' ? <Search className="text-white w-5 h-5" /> : <Sparkles className="text-white w-5 h-5" />)}
            </div>
            <span className="text-lg font-black tracking-tighter uppercase">
              {step === 0 ? 'CareerPro AI' : (appMode === 'suitability' ? 'Suitability.ai' : 'ATS CV Pro')}
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-4">
              {[1, 2, 3].map((s) => {
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                      step >= s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400"
                    )}>
                      {s}
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest",
                      step === s ? "text-zinc-900" : "text-zinc-400"
                    )}>
                      {s === 1 ? 'Profile' : s === 2 ? 'Job' : 'Report'}
                    </span>
                    {s < 3 && <div className="w-4 h-[1px] bg-zinc-100" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12 relative">
        <AnimatePresence>
          {isParsing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center gap-4"
            >
              <div className="w-16 h-16 bg-zinc-900 rounded-[24px] flex items-center justify-center shadow-2xl shadow-zinc-900/20">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-zinc-900">Extracting Profile</h3>
                <p className="text-zinc-500 text-sm">Our AI is analyzing your CV to pre-fill the form...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </AnimatePresence>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </main>

      <footer className="py-20 border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-4">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-300">
            {appMode === 'suitability' ? 'Job Suitability Analyzer' : 'ATS CV Pro Optimizer'}
          </p>
          <p className="text-zinc-400 text-sm">Precision analysis for the modern professional.</p>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
        }

        .border-bottom {
          border-bottom: 1px solid #F4F4F5;
        }
      `}</style>
    </div>
  );
}
