# To activate virtual environment:
# .\backend\venv\Scripts\Activate.ps1   

#to run the backend server:
# python .\backend\app.py

# ================= AI QUOTA MANAGER =================

AI_REQUEST_COUNT = 0
AI_REQUEST_LIMIT = 15   # safe buffer under 20 free-tier limit
AI_CACHE = {}           # topic-level cache

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json 
import sqlite3
from datetime import datetime, timedelta
import re
from collections import Counter
import hashlib
import concurrent.futures
import threading
import base64
import io
import time
from dotenv import load_dotenv
from pathlib import Path
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# PDF Processing
try:
    import pdfplumber
    PDF_LIBRARY = 'pdfplumber'
except ImportError:
    try:
        import fitz  # PyMuPDF
        PDF_LIBRARY = 'pymupdf'
    except ImportError:
        PDF_LIBRARY = None

# Image Processing for OCR
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# OCR - Tesseract
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

# PDF to Image conversion
try:
    import pdf2image
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

# NLP
try:
    import nltk
    from nltk.tokenize import sent_tokenize, word_tokenize
    from nltk.corpus import stopwords
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('punkt_tab', quiet=True)
    NLP_AVAILABLE = True
except:
    NLP_AVAILABLE = False

# Google Gemini API
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# YouTube API
try:
    from googleapiclient.discovery import build
    YOUTUBE_AVAILABLE = True
except ImportError:
    YOUTUBE_AVAILABLE = False

import requests

# Thread pool for parallel processing
THREAD_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4)

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
DATABASE = 'exam_prep.db'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ============================================================
# DATABASE SETUP
# ============================================================

def init_db():
    """Initialize SQLite database with schema"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            days INTEGER,
            hours INTEGER,
            mode TEXT,
            syllabus_text TEXT,
            pyq_text TEXT
        )
    ''')
    
    # Topics table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            name TEXT,
            subtopics TEXT,
            frequency INTEGER DEFAULT 0,
            weight REAL DEFAULT 0.5,
            priority_score REAL DEFAULT 0,
            priority_level TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    ''')
    
    # Questions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            topic_id INTEGER,
            question_text TEXT,
            year INTEGER,
            marks INTEGER,
            FOREIGN KEY (session_id) REFERENCES sessions(id),
            FOREIGN KEY (topic_id) REFERENCES topics(id)
        )
    ''')
    
    # Generated content table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS generated_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            topic_id INTEGER,
            content_type TEXT,
            content TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id),
            FOREIGN KEY (topic_id) REFERENCES topics(id)
        )
    ''')
    
    # Timetable table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS timetable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            day INTEGER,
            date TEXT,
            sessions TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    ''')
    
    conn.commit()
    conn.close()

init_db()

# ============================================================
# PDF PROCESSING
# ============================================================

def extract_text_pdfplumber(pdf_path):
    """Extract text using pdfplumber"""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text

def extract_text_pymupdf(pdf_path):
    """Extract text using PyMuPDF"""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text() + "\n"
    doc.close()
    return text

def extract_images_from_pdf(pdf_path):
    """Extract images from PDF for OCR processing"""
    images = []
    
    if PDF_LIBRARY == 'pymupdf':
        try:
            doc = fitz.open(pdf_path)
            for page_num, page in enumerate(doc):
                # Get images from page
                image_list = page.get_images()
                for img_index, img in enumerate(image_list):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    images.append({
                        'page': page_num + 1,
                        'index': img_index,
                        'bytes': image_bytes
                    })
                
                # Also render page as image for handwritten content detection
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                img_bytes = pix.tobytes("png")
                images.append({
                    'page': page_num + 1,
                    'index': 'full_page',
                    'bytes': img_bytes,
                    'is_page': True
                })
            doc.close()
        except Exception as e:
            print(f"Error extracting images with PyMuPDF: {e}")
    
    elif PDF2IMAGE_AVAILABLE:
        try:
            # Convert PDF pages to images
            pages = pdf2image.convert_from_path(pdf_path, dpi=200)
            for page_num, page in enumerate(pages):
                img_byte_arr = io.BytesIO()
                page.save(img_byte_arr, format='PNG')
                images.append({
                    'page': page_num + 1,
                    'index': 'full_page',
                    'bytes': img_byte_arr.getvalue(),
                    'is_page': True
                })
        except Exception as e:
            print(f"Error converting PDF to images: {e}")
    
    return images

def ocr_image(image_bytes):
    """Perform OCR on an image using Tesseract"""
    if not TESSERACT_AVAILABLE or not PIL_AVAILABLE:
        return ""
    
    try:
        image = Image.open(io.BytesIO(image_bytes))
        # Preprocess for better OCR
        image = image.convert('L')  # Convert to grayscale
        text = pytesseract.image_to_string(image, config='--psm 6')
        return text.strip()
    except Exception as e:
        print(f"OCR Error: {e}")
        return ""

def ocr_with_gemini(image_bytes, api_key):
    """
    Gemini Vision OCR is disabled.
    Tesseract OCR is used instead.
    """
    return ""

def process_page_ocr(page_data, api_key=None):
    """Process a single page for OCR using Tesseract only"""

    image_bytes = page_data["bytes"]
# Fallback to Tesseract
    if TESSERACT_AVAILABLE:
        return ocr_image(image_bytes)

    return ""

def extract_pdf_text_with_ocr(pdf_path, api_key=None):
    """Extract text from PDF including images and handwritten content"""
    start_time = time.time()
    
    # First, get regular text
    regular_text = ""
    if PDF_LIBRARY == 'pdfplumber':
        regular_text = extract_text_pdfplumber(pdf_path)
    elif PDF_LIBRARY == 'pymupdf':
        regular_text = extract_text_pymupdf(pdf_path)
    
    # Check if text extraction was successful
    text_quality = len(regular_text.strip()) if regular_text else 0
    
    # If text is too short or we have OCR capabilities, try OCR
    ocr_text = ""
    if text_quality < 500 or TESSERACT_AVAILABLE or (api_key and GEMINI_AVAILABLE):
        images = extract_images_from_pdf(pdf_path)
        
        # Filter to only full page images for OCR (more efficient)
        page_images = [img for img in images if img.get('is_page', False)]
        
        if page_images:
            # Process pages in parallel for speed
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                futures = []
                for page_data in page_images[:10]:  # Limit to first 10 pages for speed
                    future = executor.submit(process_page_ocr, page_data, api_key)
                    futures.append(future)
                
                for future in concurrent.futures.as_completed(futures):
                    try:
                        page_text = future.result(timeout=20)
                        if page_text:
                            ocr_text += page_text + "\n"
                    except Exception as e:
                        print(f"OCR processing error: {e}")
    
    # Combine texts
    combined_text = regular_text
    if ocr_text and len(ocr_text.strip()) > len(regular_text.strip()) * 0.1:
        combined_text = regular_text + "\n\n--- OCR Extracted Content ---\n\n" + ocr_text
    
    processing_time = time.time() - start_time
    print(f"PDF processing completed in {processing_time:.2f} seconds")
    
    return combined_text

def extract_pdf_text(pdf_path, api_key=None):
    """Extract text from PDF using available library with OCR support"""
    # Use enhanced extraction with OCR
    return extract_pdf_text_with_ocr(pdf_path, api_key)

def clean_text(text):
    """Clean and normalize extracted text"""
    # Remove multiple spaces
    text = re.sub(r'\s+', ' ', text)
    # Remove special characters but keep essential punctuation
    text = re.sub(r'[^\w\s.,;:?!\-()]', '', text)
    # Normalize whitespace
    text = text.strip()
    return text

# ============================================================
# TOPIC EXTRACTION
# ============================================================

def extract_topics_from_syllabus(syllabus_text):
    """Extract topics and subtopics from syllabus text"""
    topics = []
    
    # Common patterns for topic headers
    patterns = [
        r'(?:Unit|Chapter|Module|Topic)\s*[\d.:\-]+\s*[:\-]?\s*(.+?)(?=\n|$)',
        r'(?:^|\n)(\d+\.?\s+[A-Z][^.\n]{10,50})',
        r'(?:^|\n)([A-Z][A-Za-z\s]{5,40})(?=\s*[-:]\s*)',
    ]
    
    found_topics = set()
    
    for pattern in patterns:
        matches = re.findall(pattern, syllabus_text, re.MULTILINE | re.IGNORECASE)
        for match in matches:
            topic_name = clean_text(match).strip()
            if len(topic_name) > 3 and len(topic_name) < 100:
                found_topics.add(topic_name)
    
    # If no topics found, use keyword extraction
    if not found_topics:
        found_topics = extract_topics_nlp(syllabus_text)
    
    # Generate subtopics for each topic
    for topic in found_topics:
        subtopics = extract_subtopics(syllabus_text, topic)
        topics.append({
            'name': topic,
            'subtopics': subtopics if subtopics else ['Overview', 'Key Concepts', 'Applications']
        })
    
    # Fallback if still no topics
    if not topics:
        topics = generate_sample_topics()
    
    return topics[:15]  # Limit to 15 topics

def extract_topics_nlp(text):
    """Extract topics using NLP techniques"""
    topics = set()
    
    if NLP_AVAILABLE:
        try:
            words = word_tokenize(text.lower())
            stop_words = set(stopwords.words('english'))
            
            # Get meaningful words
            meaningful = [w for w in words if w.isalpha() and w not in stop_words and len(w) > 3]
            
            # Get most common terms
            word_freq = Counter(meaningful)
            common_terms = word_freq.most_common(20)
            
            for term, freq in common_terms:
                if freq > 2:
                    topics.add(term.title())
        except:
            pass
    
    # Add common CS topics if text contains keywords
    cs_topics = {
        'data structure': 'Data Structures',
        'algorithm': 'Algorithms',
        'database': 'Database Management',
        'operating system': 'Operating Systems',
        'network': 'Computer Networks',
        'programming': 'Programming',
        'software': 'Software Engineering',
        'web': 'Web Development',
        'machine learning': 'Machine Learning',
        'artificial intelligence': 'Artificial Intelligence'
    }
    
    text_lower = text.lower()
    for keyword, topic in cs_topics.items():
        if keyword in text_lower:
            topics.add(topic)
    
    return topics

def extract_subtopics(text, topic):
    """Extract subtopics for a given topic"""
    subtopics = []
    
    # Look for text following the topic name
    pattern = rf'{re.escape(topic)}[:\-]?\s*(.{{50,500}})'
    match = re.search(pattern, text, re.IGNORECASE)
    
    if match:
        content = match.group(1)
        # Split by common delimiters
        parts = re.split(r'[,;.\n]', content)
        for part in parts:
            part = part.strip()
            if 3 < len(part) < 50:
                subtopics.append(part)
    
    return subtopics[:5] if subtopics else None

def generate_sample_topics():
    """Generate sample topics for demonstration"""
    return [
        {'name': 'Data Structures', 'subtopics': ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Hash Tables']},
        {'name': 'Algorithms', 'subtopics': ['Sorting', 'Searching', 'Dynamic Programming', 'Greedy Algorithms']},
        {'name': 'Database Management', 'subtopics': ['SQL', 'Normalization', 'Transactions', 'Indexing']},
        {'name': 'Operating Systems', 'subtopics': ['Process Management', 'Memory Management', 'File Systems']},
        {'name': 'Computer Networks', 'subtopics': ['OSI Model', 'TCP/IP', 'Routing', 'Security']},
        {'name': 'Object-Oriented Programming', 'subtopics': ['Classes', 'Inheritance', 'Polymorphism']},
        {'name': 'Web Development', 'subtopics': ['HTML/CSS', 'JavaScript', 'APIs', 'Frameworks']},
        {'name': 'Software Engineering', 'subtopics': ['SDLC', 'Agile', 'Testing', 'Design Patterns']}
    ]

# ============================================================
# QUESTION EXTRACTION
# ============================================================

def estimate_marks(topic_name, topic_questions):
    if not topic_questions:
        return 5  # safe default exam weight
    
    qs = topic_questions.get(topic_name, [])
    if not qs:
        return 5
    
    avg = sum(q.get('marks', 5) for q in qs) / len(qs)
    if avg < 3:
        return 2
    elif avg < 6:
        return 5
    else:
        return 10

def extract_questions_from_pyq(pyq_text):
    """Extract individual questions from PYQ text"""
    questions = []
    
    # Patterns for question detection
    patterns = [
        r'(?:Q\.?\s*\d+|Question\s*\d+)[.:\)]\s*(.+?)(?=Q\.?\s*\d+|Question\s*\d+|$)',
        r'(?:\d+[\.\)]\s*)(.+?\?)',
        r'(?:^|\n)(\w.+?\?)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, pyq_text, re.MULTILINE | re.DOTALL | re.IGNORECASE)
        for match in matches:
            question = clean_text(match)
            if len(question) > 20 and len(question) < 500:
                # Try to extract marks
                marks_match = re.search(r'\[?(\d+)\s*(?:marks?|pts?|points?)\]?', question, re.IGNORECASE)
                marks = int(marks_match.group(1)) if marks_match else 5
                
                # Try to extract year
                year_match = re.search(r'20\d{2}', pyq_text)
                year = int(year_match.group()) if year_match else 2023
                
                questions.append({
                    'text': question,
                    'marks': marks,
                    'year': year
                })
    
    # Remove duplicates
    seen = set()
    unique_questions = []
    for q in questions:
        q_hash = hashlib.md5(q['text'][:50].encode()).hexdigest()
        if q_hash not in seen:
            seen.add(q_hash)
            unique_questions.append(q)
    
    return unique_questions[:50]  # Limit to 50 questions

# ============================================================
# TOPIC-QUESTION MAPPING
# ============================================================

def map_questions_to_topics(topics, questions):
    """Map questions to topics using keyword matching"""
    topic_questions = {topic['name']: [] for topic in topics}
    
    for question in questions:
        q_text = question['text'].lower()
        best_match = None
        best_score = 0
        
        for topic in topics:
            score = 0
            topic_name = topic['name'].lower()
            
            # Check topic name
            if topic_name in q_text:
                score += 10
            
            # Check subtopics
            for subtopic in topic.get('subtopics', []):
                if subtopic.lower() in q_text:
                    score += 5
            
            # Check word overlap
            topic_words = set(re.findall(r'\w+', topic_name))
            q_words = set(re.findall(r'\w+', q_text))
            overlap = len(topic_words & q_words)
            score += overlap * 2
            
            if score > best_score:
                best_score = score
                best_match = topic['name']
        
        if best_match and best_score > 0:
            topic_questions[best_match].append(question)
    
    return topic_questions

def calculate_frequencies(topics, topic_questions):
    """Calculate question frequency for each topic"""
    for topic in topics:
        topic['frequency'] = len(topic_questions.get(topic['name'], []))
    return topics

# ============================================================
# PRIORITY CALCULATION
# ============================================================

def calculate_priorities(topics):
    """Calculate priority scores and classify topics"""
    # Calculate priority score
    max_freq = max(t['frequency'] for t in topics) if topics else 1
    
    for topic in topics:
        # Normalize frequency
        freq_score = (topic['frequency'] / max_freq) * 10 if max_freq > 0 else 5
        weight = topic.get('weight', 0.5)
        
        # Priority Score = (Frequency * 0.6) + (Weight * 10 * 0.4)
        topic['priority_score'] = (freq_score * 0.6) + (weight * 10 * 0.4)
    
    # Sort by priority score
    topics.sort(key=lambda x: x['priority_score'], reverse=True)
    
    # Classify into priority levels
    third = len(topics) // 3 or 1
    
    priorities = {
        'high': [],
        'medium': [],
        'low': []
    }
    
    for i, topic in enumerate(topics):
        if i < third:
            topic['priority_level'] = 'high'
            priorities['high'].append(topic)
        elif i < third * 2:
            topic['priority_level'] = 'medium'
            priorities['medium'].append(topic)
        else:
            topic['priority_level'] = 'low'
            priorities['low'].append(topic)
    
    return topics, priorities

# ============================================================
# TIME-AWARE INTELLIGENCE
# ============================================================

def calculate_mode(days, hours):
    """Determine preparation mode based on available time"""
    total_hours = (days * 24) + hours
    
    if total_hours < 24:
        return 'crisis'
    elif total_hours < 72:
        return 'high'
    elif total_hours < 168:
        return 'fast'
    else:
        return 'normal'

def filter_topics_by_mode(priorities, mode):
    """Filter topics based on preparation mode"""
    if mode == 'crisis':
        return priorities['high']
    elif mode == 'high':
        return priorities['high'] + priorities['medium']
    elif mode == 'fast':
        return priorities['high'] + priorities['medium']
    else:
        return priorities['high'] + priorities['medium'] + priorities['low']
     

# ============================================================
# UNIVERSAL LOGIC ENGINE 
# ============================================================

def build_exam_only_notes_prompt(topic_name, branch, mode, expected_marks):
    return f"""
You are an Indian university exam answer generator.

Topic: {topic_name}
Branch: {branch}
Preparation Mode: {mode}
Expected Marks Weight: {expected_marks} marks

Generate ONLY EXAM-ORIENTED CONTENT.

This is NOT learning material.
This is NOT conceptual teaching.
This is NOT theory explanation.
This is NOT textbook content.

This is PURE EXAM SCORING CONTENT.

STRUCTURE STRICTLY REQUIRED:

--------------------------------
EXAM DEFINITION:
(2–3 lines, scoring definition language)

--------------------------------
KEY SCORING POINTS:
• Bullet points
• Each point must carry marks value
• No filler text

--------------------------------
DIAGRAM INSTRUCTIONS:
• What diagram to draw
• Labels to include
• Flow direction
• How to represent in exam

--------------------------------
ANSWER WRITING FORMAT:

2 MARK ANSWER:
• Format
• Keywords
• One-liner structure

5 MARK ANSWER:
• Intro line
• 3–4 bullet points
• Diagram mention
• Conclusion line

10 MARK ANSWER:
• Definition
• Diagram
• Structured headings
• Process flow
• Applications
• Conclusion

--------------------------------
IMPORTANT KEYWORDS:
• Scoring words
• Technical terms
• Examiner keywords

--------------------------------
COMMON EXAM MISTAKES:
• What students write wrong
• What to avoid

--------------------------------
MEMORY HOOKS:
• Mnemonic
• Recall trick
• Memory anchor

--------------------------------
SCORING STRATEGY:
• How to attempt question
• Presentation style
• Examiner psychology

RULES:
- Bullets only
- No paragraphs
- No stories
- No explanations
- No theory
- No generic text
- No teaching tone
- No AI filler
- Exam answer language only
"""

def build_learning_notes_prompt(topic_name, branch, mode, syllabus_context, pyq_context):
    return f"""
You are a university-level teaching assistant for {branch} engineering students.

Topic: {topic_name}
Preparation Mode: {mode}

SYLLABUS CONTEXT:
{syllabus_context[:1200]}

PYQ CONTEXT:
{pyq_context[:1200]}

Generate HIGH-QUALITY LEARNING NOTES.

GOALS:
- Concept clarity
- Intuitive understanding
- Logical structure
- Progressive depth
- Real-world mapping
- Visual imagination
- Memory anchoring
- Application thinking

STRUCTURE:

1) Conceptual Introduction  
2) Intuitive Explanation  
3) Core Theory  
4) Internal Working  
5) Architecture / Flow  
6) Real-world Analogy  
7) Examples  
8) Diagrams (description)  
9) Common Confusions  
10) PYQ Pattern Relevance  
11) Exam Connection  
12) Memory Hooks  
13) Summary  

RULES:
- Natural language
- Mixed bullets + explanation
- Concept-first approach
- No rigid template repetition
- Learning-focused tone
- No exam-only language
- No bullet-only enforcement
"""


def detect_branch_from_text(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ["multiplexer", "flip-flop", "vlsi", "signal", "amplifier"]):
        return "ECE"
    if any(k in t for k in ["algorithm", "data structure", "os", "dbms", "compiler"]):
        return "CS"
    if any(k in t for k in ["tcp", "ip", "osi", "routing", "network"]):
        return "IT"
    return "ENGINEERING"


def build_exam_prompt(topic_name, content_type, branch, mode):
    base = f"""
You are an exam preparation assistant for {branch} engineering students.

Topic: {topic_name}
Preparation mode: {mode}

Follow Indian university exam patterns.
Be concise, structured, and scoring.
"""

    if content_type == "notes":
        return base + """
Write comprehensive, exam-oriented notes with the following structure:

**Definition & Overview**
- Clear, concise definition
- Purpose and importance in the field

**Key Concepts & Principles**
- Fundamental concepts with explanations
- Important formulas/theorems (if applicable)
- Core principles and mechanisms

**Detailed Explanation**
- Step-by-step working/process
- Architecture/components (if applicable)
- Types/variants and their differences

**Applications & Use Cases**
- Real-world applications
- Industry relevance
- Practical examples

**Important Diagrams & Visualizations**
- Key diagrams that are exam favorites
- Flowcharts, block diagrams, or circuit diagrams
- Memory aids for visual learners

**Common Exam Questions & Expected Answers**
- Frequently asked questions
- Important points to remember
- Common mistakes to avoid

**Summary & Quick Revision Points**
- Bullet points for last-minute revision
- Key takeaways
- Exam scoring tips

Keep the content structured, concise yet comprehensive, and focused on exam success. Use clear headings and bullet points for easy reading.
"""

    if content_type == "questions":
        return base + "Generate 5 likely exam questions with marks."

    if content_type == "mcqs":
        return base + "Generate 4 MCQs with correct answers."

    if content_type == "revision":
        return base + "Generate short revision bullets."

    return base


def generate_branch_marks_fallback(topic, content_type, branch, marks):
    name = topic.get("name", "Topic")
    subs = topic.get("subtopics", ["Overview", "Working", "Applications"])

    if content_type == "notes":
        if marks <= 2:
            return f"{name}: Basic definition and purpose."

        if marks <= 5:
            return {
                "definition": f"{name} is an important concept in {branch}.",
                "points": [f"{s} – key exam concept" for s in subs[:3]]
            }

        return {
            "definition": f"{name} is a fundamental topic in {branch}.",
            "key_points": [f"{s} – frequently asked in exams" for s in subs],
            "applications": subs[:3],
            "exam_questions": [
                f"Define {name}",
                f"Explain {name} with diagram",
                f"List applications of {name}"
            ]
        }

    if content_type == "questions":
        return f"1. Explain {name} ({marks} marks)\n2. Define {name} and its importance ({marks//2} marks)\n3. List key features of {name} ({marks//2} marks)\n4. Compare {name} with related concepts ({marks} marks)\n5. Discuss applications of {name} ({marks} marks)"

    if content_type == "mcqs":
        return [
            {
                "question": f"What is the primary purpose of {name}?",
                "options": [f"To perform {subs[0] if subs else 'basic operations'}", f"To handle {subs[1] if len(subs) > 1 else 'data processing'}", f"To manage {subs[2] if len(subs) > 2 else 'system resources'}", f"To optimize {subs[3] if len(subs) > 3 else 'performance'}"],
                "answer": f"To perform {subs[0] if subs else 'basic operations'}",
                "explanation": f"{name} is primarily designed to perform {subs[0] if subs else 'basic operations'} in {branch} applications."
            },
            {
                "question": f"Which of the following is NOT a key aspect of {name}?",
                "options": [f"{subs[0] if subs else 'Core functionality'}", f"{subs[1] if len(subs) > 1 else 'Advanced features'}", "Unrelated concept", f"{subs[2] if len(subs) > 2 else 'Implementation details'}"],
                "answer": "Unrelated concept",
                "explanation": f"{name} focuses on {', '.join(subs[:3]) if subs else 'core concepts'} rather than unrelated concepts."
            },
            {
                "question": f"In which scenario would {name} be most beneficial?",
                "options": [f"When dealing with {subs[0] if subs else 'complex problems'}", f"For {subs[1] if len(subs) > 1 else 'optimization'} purposes", f"In {subs[2] if len(subs) > 2 else 'system design'}", f"All of the above"],
                "answer": f"All of the above",
                "explanation": f"{name} is beneficial in multiple scenarios including {', '.join(subs[:3]) if subs else 'various applications'}."
            },
            {
                "question": f"What makes {name} important in {branch}?",
                "options": [f"Its role in {subs[0] if subs else 'fundamental concepts'}", f"Industry applications", f"Exam relevance", f"All of the above"],
                "answer": f"All of the above",
                "explanation": f"{name} is crucial in {branch} due to its fundamental concepts, practical applications, and importance in examinations."
            }
        ]

    if content_type == "revision":
        return f"• {name}: key concept to remember\n• Focus on {subs[0] if subs else 'core principles'}\n• Practice related problems\n• Review important formulas/diagrams"

    return {}

def build_batch_exam_prompt(topic_name, branch, mode, expected_marks):
    return f"""
You are an Indian university exam preparation AI.

Topic: {topic_name}
Branch: {branch}
Preparation Mode: {mode}
Expected Marks Weight: {expected_marks}

Generate ALL CONTENT in ONE RESPONSE in STRICT JSON FORMAT:

{{
  "notes": "structured exam-oriented notes",
  "questions": "5 likely exam questions with marks",
  "mcqs": [
    {{
      "question": "...",
      "options": ["A","B","C","D"],
      "answer": "A",
      "explanation": "..."
    }}
  ],
  "revision": [
    "bullet point 1",
    "bullet point 2",
    "bullet point 3"
  ]
}}

RULES:
- Exam-oriented
- Scoring focused
- Indian university pattern
- Structured
- No filler
- No AI language
- No markdown
- Valid JSON only
"""

# ============================================================
# AI CONTENT GENERATION
# ============================================================

def generate_ai_content(topic, api_key, mode="normal", topic_questions=None):
    global AI_REQUEST_COUNT, AI_CACHE

    topic_name = topic["name"]

    # ---------- CACHE ----------
    if topic_name in AI_CACHE:
        print(f"♻️ CACHE HIT → {topic_name}")
        return AI_CACHE[topic_name]

    # ---------- RATE LIMIT ---------
    if AI_REQUEST_COUNT >= AI_REQUEST_LIMIT:
        print("🛑 AI QUOTA LIMIT HIT — SWITCHING TO FALLBACK")
        fallback = {
            "notes": generate_branch_marks_fallback(topic, 'notes', detect_branch_from_text(topic_name), 10),
            "questions": generate_branch_marks_fallback(topic, 'questions', detect_branch_from_text(topic_name), 10),
            "mcqs": generate_branch_marks_fallback(topic, 'mcqs', detect_branch_from_text(topic_name), 2),
            "revision": generate_branch_marks_fallback(topic, 'revision', detect_branch_from_text(topic_name), 5),
            "source": "fallback"
        }
        return fallback

    branch = detect_branch_from_text(topic_name)
    expected_marks = estimate_marks(topic_name, topic_questions or {})

    prompt = build_batch_exam_prompt(
        topic_name=topic_name,
        branch=branch,
        mode=mode,
        expected_marks=expected_marks
    )

    print(f"🧠 AI BATCH START → {topic_name}")

    try:
        AI_REQUEST_COUNT += 1
        raw = ai_generate(prompt)

        data = json.loads(raw)   # strict JSON expected

        result = {
            "notes": data.get("notes", ""),
            "questions": data.get("questions", ""),
            "mcqs": data.get("mcqs", []),
            "revision": data.get("revision", []),
            "source": "ai"
        }

        AI_CACHE[topic_name] = result   # cache it
        print(f"✅ AI BATCH DONE → {topic_name}")
        return result

    except Exception as e:
        print(f"⚠️ AI FAILED → {topic_name} → {e}")

        fallback = {
            "notes": generate_branch_marks_fallback(topic, 'notes', branch, 10),
            "questions": generate_branch_marks_fallback(topic, 'questions', branch, 10),
            "mcqs": generate_branch_marks_fallback(topic, 'mcqs', branch, 2),
            "revision": generate_branch_marks_fallback(topic, 'revision', branch, 5),
            "source": "fallback"
        }
        return fallback

def ai_generate(prompt):
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise Exception("Gemini API key not found in .env")

    # Step 1: List models from REST registry
    models_url = f"https://generativelanguage.googleapis.com/v1/models?key={gemini_key}"
    models_resp = requests.get(models_url, timeout=30)

    if models_resp.status_code != 200:
        raise Exception(f"Model registry error: {models_resp.text}")

    models_data = models_resp.json().get("models", [])

    # Step 2: Pick a model that supports generateContent
    selected_model = None
    for m in models_data:
        if "supportedGenerationMethods" in m and "generateContent" in m["supportedGenerationMethods"]:
            selected_model = m["name"]
            break

    if not selected_model:
        raise Exception("No generateContent-supported model found in this project")

    # Step 3: Call generateContent
    url = f"https://generativelanguage.googleapis.com/v1/{selected_model}:generateContent"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }

    headers = {"Content-Type": "application/json"}

    resp = requests.post(f"{url}?key={gemini_key}", headers=headers, json=payload, timeout=60)

    if resp.status_code != 200:
        raise Exception(f"Gemini API Error {resp.status_code}: {resp.text}")

    data = resp.json()

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except:
        raise Exception(f"Invalid Gemini response: {data}")

# ============================================================
# TIMETABLE GENERATION
# ============================================================

def generate_timetable(topics, days, hours, mode):
    """Generate study timetable based on priorities and time"""
    timetable = []
    
    # Calculate study hours per day based on mode
    study_hours = {
        'crisis': 12,
        'high': 10,
        'fast': 8,
        'normal': 6
    }
    hours_per_day = study_hours.get(mode, 8)
    
    total_days = max(1, days)
    topic_index = 0
    
    for day in range(1, total_days + 1):
        date = (datetime.now() + timedelta(days=day-1)).strftime('%Y-%m-%d')
        
        sessions = []
        
        # Morning session - Deep study
        if topic_index < len(topics):
            sessions.append({
                'time': '9:00 AM - 12:00 PM',
                'topic': topics[topic_index]['name'],
                'activity': 'Deep Study & Notes',
                'priority': topics[topic_index].get('priority_level', 'medium')
            })
            topic_index += 1
        
        # Afternoon session - Practice
        if topic_index < len(topics):
            sessions.append({
                'time': '2:00 PM - 5:00 PM',
                'topic': topics[topic_index]['name'],
                'activity': 'Practice Questions & MCQs',
                'priority': topics[topic_index].get('priority_level', 'medium')
            })
            topic_index += 1
        
        # Evening session - Revision (always included)
        sessions.append({
            'time': '7:00 PM - 9:00 PM',
            'topic': 'Revision',
            'activity': 'Quick Revision & Summary',
            'priority': 'revision'
        })
        
        timetable.append({
            'day': day,
            'date': date,
            'sessions': sessions
        })
        
        # Reset topic index if needed
        if topic_index >= len(topics):
            topic_index = 0
    
    return timetable

# ============================================================
# YOUTUBE VIDEO INTEGRATION
# ============================================================

def fetch_youtube_videos(topic, api_key=None):
    """Fetch relevant YouTube videos for a topic"""
    if not api_key:
        return generate_youtube_search_links(topic)

    try:
        return fetch_with_youtube_api(topic, api_key)
    except Exception as e:
        print("YouTube fallback:", e)
        return generate_youtube_search_links(topic)

def parse_youtube_duration(duration_str):
    """Parse ISO 8601 duration format to human readable format"""
    import re

    # Match ISO 8601 duration format (PT#H#M#S)
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if not match:
        return 'N/A'

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)

    if hours > 0:
        return f"{hours}h {minutes}m"
    elif minutes > 0:
        return f"{minutes}m {seconds}s"
    else:
        return f"{seconds}s"

def fetch_with_youtube_api(topic, api_key):
    """Fetch videos using YouTube Data API"""
    try:
        youtube = build('youtube', 'v3', developerKey=api_key)

        videos = []
        for subtopic in topic.get('subtopics', [topic['name']])[:3]:
            query = f"{topic['name']} {subtopic} tutorial"

            # First get video IDs from search
            search_request = youtube.search().list(
                q=query,
                part='snippet',
                maxResults=1,
                type='video',
                videoDuration='medium'
            )
            search_response = search_request.execute()

            for item in search_response.get('items', []):
                video_id = item['id']['videoId']

                # Get video details including duration
                details_request = youtube.videos().list(
                    part='snippet,contentDetails',
                    id=video_id
                )
                details_response = details_request.execute()

                for video_item in details_response.get('items', []):
                    duration = parse_youtube_duration(video_item['contentDetails']['duration'])

                    videos.append({
                        'title': video_item['snippet']['title'],
                        'channel': video_item['snippet']['channelTitle'],
                        'url': f"https://www.youtube.com/watch?v={video_id}",
                        'duration': duration
                    })

        return videos

    except Exception as e:
        print(f"YouTube API Error: {e}")
        return generate_youtube_search_links(topic)

def generate_youtube_search_links(topic):
    """Generate YouTube search links without API"""
    videos = []
    
    for subtopic in topic.get('subtopics', ['Overview'])[:3]:
        query = f"{topic['name']} {subtopic} tutorial"
        search_url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
        
        videos.append({
            'title': f"{subtopic} - Complete Tutorial",
            'channel': 'Search Results',
            'url': search_url,
            'duration': 'Varies'
        })
    
    return videos

def search_youtube(query):
    youtube_key = os.getenv("YOUTUBE_API_KEY")

    youtube = build("youtube", "v3", developerKey=youtube_key)

    request = youtube.search().list(
        part="snippet",
        q=query,
        maxResults=5,
        type="video"
    )

    return request.execute()


# ============================================================
# API ENDPOINTS
# ============================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'pdf_library': PDF_LIBRARY,
        'nlp_available': NLP_AVAILABLE,
        'gemini_available': GEMINI_AVAILABLE,
        'youtube_available': YOUTUBE_AVAILABLE,
        'ocr_available': TESSERACT_AVAILABLE or GEMINI_AVAILABLE,
        'tesseract_available': TESSERACT_AVAILABLE,
        'pdf2image_available': PDF2IMAGE_AVAILABLE,
        'pil_available': PIL_AVAILABLE,
        'handwriting_support': GEMINI_AVAILABLE  # Gemini Vision for handwriting
    })

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Main analysis endpoint"""
    try:
        print("\n================ API /api/analyze CALLED ================\n")
        # Get files
        syllabus_file = request.files.get('syllabus')
        pyq_files = request.files.getlist('pyqs')
        
        # Get parameters
        days = int(request.form.get('days', 7))
        hours = int(request.form.get('hours', 0))
        gemini_key = os.getenv("GEMINI_API_KEY")
        youtube_key = os.getenv("YOUTUBE_API_KEY")

        # Generate session ID
        session_id = hashlib.md5(f"{datetime.now().isoformat()}".encode()).hexdigest()
        
        # Calculate mode
        mode = calculate_mode(days, hours)
        
        # Extract syllabus text (with OCR support)
        syllabus_text = ""
        if syllabus_file:
            syllabus_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_syllabus.pdf")
            syllabus_file.save(syllabus_path)
            syllabus_text = extract_pdf_text(syllabus_path, gemini_key)
            syllabus_text = clean_text(syllabus_text)
            print("✅ DONE: SYLLABUS PDF PROCESSING")
        
        # Extract PYQ text (parallel processing for multiple files)
        pyq_text = ""
        pyq_paths = []
        for i, pyq_file in enumerate(pyq_files):
            pyq_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_pyq_{i}.pdf")
            pyq_file.save(pyq_path)
            pyq_paths.append(pyq_path)
        
        # Process PYQ files in parallel for speed
        if pyq_paths:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = {executor.submit(extract_pdf_text, path, gemini_key): path for path in pyq_paths}
                for future in concurrent.futures.as_completed(futures):
                    try:
                        pyq_text += future.result() + "\n"
                    except Exception as e:
                        print(f"Error processing PYQ: {e}")
        
        pyq_text = clean_text(pyq_text)
        print("✅ DONE: PYQ PDF PROCESSING")
        
        # Extract topics from syllabus
        topics = extract_topics_from_syllabus(syllabus_text)
        print("✅ DONE: TOPIC EXTRACTION")

        # Extract questions from PYQs
        questions = extract_questions_from_pyq(pyq_text)
        
        # Map questions to topics
        topic_questions = map_questions_to_topics(topics, questions)
        print("✅ DONE: QUESTION-TOPIC MAPPING")

        # Calculate frequencies
        topics = calculate_frequencies(topics, topic_questions)
        
        # Calculate priorities
        topics, priorities = calculate_priorities(topics)
        print("✅ DONE: PRIORITY CALCULATION")

        # Filter topics by mode
        active_topics = filter_topics_by_mode(priorities, mode)
        
        # Generate content for active topics

        notes = {}
        likely_questions = {}
        mcqs = {}
        revision = {}
        videos = {}

        for topic in active_topics:
            topic_name = topic['name']
        
            ai_bundle = generate_ai_content(
                topic=topic,
                api_key=gemini_key,
                mode=mode,
                topic_questions=topic_questions
            )
        
            notes[topic_name] = {
                "content": ai_bundle["notes"],
                "source": ai_bundle["source"]
            }
        
            likely_questions[topic_name] = {
                "content": ai_bundle["questions"],
                "source": ai_bundle["source"]
            }
        
            mcqs[topic_name] = {
                "content": ai_bundle["mcqs"],
                "source": ai_bundle["source"]
            }
        
            revision[topic_name] = {
                "content": ai_bundle["revision"],
                "source": ai_bundle["source"]
            }
        
            videos[topic_name] = fetch_youtube_videos(topic, youtube_key)
        
        print("✅ DONE: BATCH AI GENERATION")

        # Generate timetable
        timetable = generate_timetable(active_topics, days, hours, mode)
        
        # Save to database
        save_to_database(session_id, days, hours, mode, syllabus_text, pyq_text,
                        topics, questions, notes, likely_questions, mcqs, revision, timetable)
        print("✅ DONE: DATABASE SAVE")
        
        # Prepare response
        response_data = {
            'session_id': session_id,
            'mode': mode,
            'topics': topics,
            'priorities': priorities,
            'questions': [{'topic': q.get('topic', 'General'), 'question': q['text'], 'year': q['year']} 
                         for q in questions],
            'notes': notes,
            'likely_questions': likely_questions,
            'mcqs': mcqs,
            'revision': revision,
            'timetable': timetable,
            'videos': videos,
            'stats': {
                'total_topics': len(topics),
                'total_questions': len(questions),
                'total_hours': (days * 24) + hours,
                'coverage': get_coverage_percentage(mode)
            }
        }
        
        print("🚀 RESPONSE SENT TO FRONTEND")
        return jsonify(response_data)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def get_coverage_percentage(mode):
    """Get syllabus coverage percentage based on mode"""
    coverage = {
        'normal': 100,
        'fast': 80,
        'high': 65,
        'crisis': 35
    }
    return coverage.get(mode, 100)

def save_to_database(session_id, days, hours, mode, syllabus_text, pyq_text,
                     topics, questions, notes, likely_questions, mcqs, revision, timetable):
    """Save all data to SQLite database"""
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        
        # Save session
        cursor.execute('''
            INSERT INTO sessions (id, days, hours, mode, syllabus_text, pyq_text)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (session_id, days, hours, mode, syllabus_text[:5000], pyq_text[:5000]))
        
        # Save topics
        for topic in topics:
            cursor.execute('''
                INSERT INTO topics (session_id, name, subtopics, frequency, weight, priority_score, priority_level)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (session_id, topic['name'], json.dumps(topic.get('subtopics', [])),
                  topic.get('frequency', 0), topic.get('weight', 0.5),
                  topic.get('priority_score', 0), topic.get('priority_level', 'medium')))
        
        # Save timetable
        for day in timetable:
            cursor.execute('''
                INSERT INTO timetable (session_id, day, date, sessions)
                VALUES (?, ?, ?, ?)
            ''', (session_id, day['day'], day['date'], json.dumps(day['sessions'])))
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        print(f"Database Error: {e}")

@app.route('/api/session/<session_id>', methods=['GET'])
def get_session(session_id):
    """Retrieve a previous session"""
    try:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get session
        cursor.execute('SELECT * FROM sessions WHERE id = ?', (session_id,))
        session = cursor.fetchone()
        
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        # Get topics
        cursor.execute('SELECT * FROM topics WHERE session_id = ?', (session_id,))
        topics = [dict(row) for row in cursor.fetchall()]
        
        # Get timetable
        cursor.execute('SELECT * FROM timetable WHERE session_id = ?', (session_id,))
        timetable = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'session': dict(session),
            'topics': topics,
            'timetable': timetable
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-content', methods=['POST'])
def generate_content():
    """Generate AI content for a specific topic"""
    try:
        data = request.json
        topic = data.get('topic', {})
        content_type = data.get('content_type', 'notes')
        
        content = generate_ai_content(
    topic,
    content_type,
    marks=data.get("marks", 10),
    mode=data.get("mode", "normal")
)
        
        return jsonify({'content': content})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube-search', methods=['POST'])
def youtube_search():
    """Search YouTube for topic videos"""
    try:
        data = request.json
        topic = data.get('topic', {})
        
        videos = fetch_youtube_videos(topic)    
        
        return jsonify({'videos': videos})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/test-gemini')
def test_gemini():
    try:
        out = ai_generate("Reply with exactly: Gemini connected successfully")
        return jsonify({"status": "success", "output": out})
    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)})
    
    
@app.route('/api/test-youtube')
def test_youtube():
    key = os.getenv("YOUTUBE_API_KEY")
    url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&type=video&key={key}"
    r = requests.get(url, timeout=30)
    return jsonify({
        "key_loaded": bool(key),
        "status_code": r.status_code,
        "response": r.text
    })

# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    print("=" * 60)
    print("AI-Assisted Rapid Exam Preparation System - Backend")
    print("=" * 60)
    print(f"PDF Library: {PDF_LIBRARY or 'Not available'}")
    print(f"NLP Available: {NLP_AVAILABLE}")
    print(f"Gemini API Available: {GEMINI_AVAILABLE} (FREE!)")
    print(f"YouTube API Available: {YOUTUBE_AVAILABLE}")
    print("-" * 60)
    print("OCR & Image Processing:")
    print(f"  Tesseract OCR: {TESSERACT_AVAILABLE}")
    print(f"  PDF to Image: {PDF2IMAGE_AVAILABLE}")
    print(f"  PIL/Pillow: {PIL_AVAILABLE}")
    print(f"  Handwriting Support (Gemini Vision): {GEMINI_AVAILABLE}")
    print("=" * 60)
    print("Get your FREE Gemini API key at:")
    print("  https://aistudio.google.com/app/apikey")
    print("=" * 60)
    print("Starting server on http://localhost:5000")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)
