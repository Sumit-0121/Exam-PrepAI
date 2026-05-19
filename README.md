#  Exam-PrepAI  
### AI-Assisted Rapid Exam Preparation System

**Exam-PrepAI** is a full-stack AI-powered exam preparation platform designed to automate syllabus analysis, topic prioritization, intelligent content generation, and strategic revision planning using AI-driven pipelines.

This system transforms raw academic inputs (syllabus PDFs and previous year question papers) into a structured, prioritized, and exam-oriented preparation workflow using NLP, OCR, AI models, and intelligent scheduling logic.

Developed as an academic + portfolio-grade project with production-grade architecture.

---

## Core Capabilities

### Intelligent Document Processing
- PDF syllabus extraction
- Multi-file PYQ processing
- OCR for scanned PDFs
- Handwritten content support
- Image-based text extraction
- Parallel PDF processing

### AI Intelligence Layer
- Topic extraction engine
- Subtopic generation
- NLP-based keyword mapping
- Question-topic correlation
- Frequency-based topic scoring
- AI caching & quota management
- Fallback logic (offline-safe mode)

### Exam-Oriented Intelligence
- Priority-based topic classification (High / Medium / Low)
- Exam weight estimation
- Marks-based content structuring
- Scoring-oriented answer generation
- PYQ pattern analysis
- Exam strategy modeling

### Time-Aware Preparation System
- Crisis Mode (< 24 hrs)
- High-Priority Mode (1–3 days)
- Fast-Track Mode (3–7 days)
- Normal Mode (7+ days)
- Adaptive topic filtering by time availability

### AI Content Engine
- Exam-oriented notes generation
- Learning-focused notes mode
- Likely exam questions generator
- MCQ generator
- Revision bullet generator
- Structured JSON AI pipelines

### System Outputs
- AI-generated structured notes
- Topic-wise exam questions
- MCQs with explanations
- Smart revision points
- Priority dashboards
- Study plan visualization
- PDF export of generated notes

---

## System Architecture

### Data Flow:
User Input
→ Frontend (HTML/CSS/JS)
→ Flask API
→ PDF Processor
→ OCR Engine
→ NLP Engine
→ Topic Extractor
→ Priority Engine
→ AI Engine (Gemini)
→ AI Structuring Layer
→ SQLite Storage
→ Response API
→ Frontend Rendering


### AI Pipeline:
Input Data
→ Preprocessing
→ OCR
→ NLP Parsing
→ Topic Detection
→ PYQ Mapping
→ Priority Scoring
→ Mode Filtering
→ AI Prompt Engineering
→ AI Generation
→ Validation Layer
→ Structuring Engine
→ Storage
→ UI Rendering


---

## Technology Stack

### Backend
- Python
- Flask
- SQLite
- Gemini API (Google GenAI)
- YouTube API
- Tesseract OCR
- PyMuPDF / pdfplumber
- pdf2image
- NLTK
- dotenv
- Multithreading
- Concurrent processing

### Frontend
- HTML5
- TailwindCSS
- JavaScript (Vanilla)
- FontAwesome
- jsPDF

---

## Project Structure

```text
Exam-PrepAI/
│
├── backend/
│   ├── app.py
│   ├── requirements.txt
│
├── index.html
├── script.js
├── styles.css
├── README.md
└── run.bat
```


## System Architecture
```pgsql
Data Flow
User → Frontend → Flask API → AI Engine → Processing → Database → Response

AI Pipeline
Input → Preprocessing → AI Model → Structuring → Validation → Storage → Output
```

---

## Installation & Setup

1️⃣ Clone Repository
```bash
git clone https://github.com/Sumit-0121/Exam-PrepAI.git
cd Exam-PrepAI
```

2️⃣ Create Virtual Environment
```bash
python -m venv venv
venv\Scripts\activate
```

3️⃣ Install Dependencies
```bash
pip install -r backend/requirements.txt
```

4️⃣ Configure Environment Variables
```bash
Create .env file:
backend/.env

Add:
GEMINI_API_KEY=your_api_key_here
YOUTUBE_API_KEY=your_api_key_here
```

5️⃣ Run Backend Server
```bash
cd backend
python app.py
```

6️⃣ Access Application
```bash
http://127.0.0.1:5000
```

# Developer

## Sumit Prasad

### Connect With Me

- LinkedIn: https://www.linkedin.com/in/sumit-prasad-5111b2312
- GitHub: https://github.com/Sumit-0121
- Email: sumitprasad2105@gmail.com
