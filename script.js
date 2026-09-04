/*GLOBAL STATE (UI IS DRIVEN FROM THIS ONLY)*/
let appState = {
    syllabusFile: null,
    pyqFiles: [],
    days: 7,
    hours: 0,
    mode: 'normal',
    topics: [],
    questions: [],
    priorities: { high: [], medium: [], low: [] },
    notes: {},
    likelyQuestions: {},
    mcqs: {},
    revision: {},
    timetable: [],
    videos: {},
    currentTab: 'priorities'
};

/* CONFIG*/
const API_BASE = 'http://localhost:5000/api';
const uploadSection = document.getElementById('uploadSection');
const loadingSection = document.getElementById('loadingSection');
const dashboardSection = document.getElementById('dashboardSection');
const loadingStatus = document.getElementById('loadingStatus');
const progressBar = document.getElementById('progressBar');
const daysInput = document.getElementById('daysInput');
const hoursInput = document.getElementById('hoursInput');


/* FILE HANDLING*/

function handleDragOver(e, zoneId) {
    e.preventDefault();
    document.getElementById(zoneId).classList.add('dragover');
}

function handleDragLeave(zoneId) {
    document.getElementById(zoneId).classList.remove('dragover');
}

function handleDrop(e, inputId, zoneId) {
    e.preventDefault();
    document.getElementById(zoneId).classList.remove('dragover');
    const files = e.dataTransfer.files;
    const input = document.getElementById(inputId);
    input.files = files;
    handleFileSelect(input, inputId === 'syllabusInput' ? 'syllabus' : 'pyq');
}


function handleFileSelect(input, type) {
    if (type === 'syllabus') {
        appState.syllabusFile = input.files[0];
        document.getElementById('syllabusFileName').textContent = '✓ ' + input.files[0].name;
        document.getElementById('syllabusFileName').classList.remove('hidden');
    } else {
        appState.pyqFiles = Array.from(input.files);
        document.getElementById('pyqFileName').textContent =
            `✓ ${appState.pyqFiles.length} file(s) selected`;
        document.getElementById('pyqFileName').classList.remove('hidden');
    }
    updateModePreview();
}

/* MODE CALCULATION*/
function calculateMode(days, hours) {
    const total = days * 24 + hours;
    if (total < 24) return 'crisis';
    if (total < 72) return 'high';
    if (total < 168) return 'fast';
    return 'normal';
}

function updateModePreview() {
    appState.days = +daysInput.value;
    appState.hours = +hoursInput.value;
    appState.mode = calculateMode(appState.days, appState.hours);

    const modeNames = {
        normal: 'Normal Mode',
        fast: 'Fast-Track Mode',
        high: 'High-Priority Mode',
        crisis: 'Crisis Mode'
    };

    document.getElementById('currentMode').innerHTML =
        `<i class="fas fa-clock mr-2"></i>${modeNames[appState.mode]}`;
}

/* START ANALYSIS*/
async function startAnalysis() {
    if (!appState.syllabusFile) {
        showNotification('Upload syllabus first', 'warning');
        return;
    }

    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');

    try {
        await performRealAnalysis();
    } catch (err) {
        console.error('Analysis Error', err);
        showNotification('Analysis failed. Please check your backend connection.', 'error');
        uploadSection.classList.remove('hidden');
        loadingSection.classList.add('hidden');
    }
}



/* REAL BACKEND ANALYSIS (FILLS appState ONLY)*/
async function performRealAnalysis() {
    const formData = new FormData();
    formData.append('syllabus', appState.syllabusFile);
    appState.pyqFiles.forEach(f => formData.append('pyqs', f));
    formData.append('days', appState.days);
    formData.append('hours', appState.hours);

    const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) throw new Error();

    const data = await res.json();

    // BACKEND → UI STATE MAPPING
    appState.topics = data.topics;
    appState.priorities = data.priorities;
    appState.notes = data.notes;
    appState.likelyQuestions = data.likely_questions;
    appState.mcqs = data.mcqs;
    appState.revision = data.revision;
    appState.timetable = data.timetable;
    appState.videos = data.videos;
    appState.questions = data.questions;

    loadingSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    updateStats();
    switchTab('priorities');
}


/* STATS UPDATE*/
function updateStats() {
    const totalTopics = appState.topics.length;
    const totalQuestions = appState.questions.length;
    const totalHours = (appState.days * 24) + appState.hours;

    // Calculate coverage based on mode
    const coverageMap = { normal: 100, fast: 80, high: 65, crisis: 35 };
    const coverage = coverageMap[appState.mode] || 100;

    document.getElementById('statTopics').textContent = totalTopics;
    document.getElementById('statQuestions').textContent = totalQuestions;
    document.getElementById('statTime').textContent = totalHours;
    document.getElementById('statCoverage').textContent = `${coverage}%`;
}

/* TAB SWITCHING*/
function switchTab(tabName) {
    appState.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('bg-white', 'shadow');
    });

    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('tab-active');
        activeTab.classList.remove('bg-white', 'shadow');
    }

    // Render tab content
    renderTabContent();
}

/*TAB CONTENT RENDERING*/
function renderTabContent() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    switch (appState.currentTab) {
        case 'priorities':
            renderPriorities();
            break;
        case 'notes':
            renderNotes();
            break;
        case 'questions':
            renderQuestions();
            break;
        case 'mcqs':
            renderMCQs();
            break;
        case 'revision':
            renderRevision();
            break;
        case 'timetable':
            renderTimetable();
            break;
        case 'videos':
            renderVideos();
            break;
        default:
            renderPriorities();
    }
}

/*PRIORITIES RENDERING*/
function renderPriorities() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    let html = '<div class="space-y-6">';

    // High Priority
    if (appState.priorities.high.length > 0) {
        html += `
            <div class="priority-section">
                <h3 class="text-xl font-bold text-red-600 mb-4 flex items-center">
                    <i class="fas fa-fire mr-2"></i>High Priority Topics
                </h3>
                <div class="grid gap-4">
        `;
        appState.priorities.high.forEach(topic => {
            html += renderTopicCard(topic, 'high');
        });
        html += '</div></div>';
    }

    // Medium Priority
    if (appState.priorities.medium.length > 0) {
        html += `
            <div class="priority-section">
                <h3 class="text-xl font-bold text-orange-600 mb-4 flex items-center">
                    <i class="fas fa-exclamation-triangle mr-2"></i>Medium Priority Topics
                </h3>
                <div class="grid gap-4">
        `;
        appState.priorities.medium.forEach(topic => {
            html += renderTopicCard(topic, 'medium');
        });
        html += '</div></div>';
    }

    // Low Priority
    if (appState.priorities.low.length > 0) {
        html += `
            <div class="priority-section">
                <h3 class="text-xl font-bold text-green-600 mb-4 flex items-center">
                    <i class="fas fa-check-circle mr-2"></i>Low Priority Topics
                </h3>
                <div class="grid gap-4">
        `;
        appState.priorities.low.forEach(topic => {
            html += renderTopicCard(topic, 'low');
        });
        html += '</div></div>';
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

/*NOTES RENDERING*/
function renderNotes() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    const topicNames = Object.keys(appState.notes);

    let html = `
        <div class="notes-container space-y-8">
            <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center">
                    <i class="fas fa-book-open text-blue-600 mr-3"></i>
                    Study Notes
                </h2>
                <p class="text-gray-600 mb-4">Comprehensive study materials organized by topic</p>
                ${topicNames.length > 0 ? `<button onclick="downloadAllNotes()" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    <i class="fas fa-download mr-2"></i>Download All Notes
                </button>` : ''}
            </div>
    `;
    if (topicNames.length > 0) {
        html += '<div class="notes-grid grid gap-6 md:grid-cols-1 lg:grid-cols-2">';

        topicNames.forEach((topicName, index) => {
            const note = appState.notes[topicName];
            const colors = ['blue', 'green', 'purple', 'indigo', 'teal', 'cyan'];
            const color = colors[index % colors.length];

            // Handle both string and object content
            let contentToFormat = note.content;
            if (typeof note.content === 'object' && note.content !== null) {
                // Convert object content to formatted string
                contentToFormat = formatNoteObject(note.content);
            }

            // Handle content formatting
            let displayContent = "Content not available";
            let showAIBadge = false;

            if (note && note.content) {
                if (typeof note.content === 'object' && note.content !== null) {
                    displayContent = formatNoteObject(note.content);
                } else {
                    displayContent = note.content;
                }
                showAIBadge = note.source === 'ai';
            }

            html += `
                <div class="note-card group relative overflow-hidden rounded-2xl bg-gradient-to-br from-${color}-50 to-${color}-100 border border-${color}-200 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-${color}-600 to-${color}-700 p-6 text-white">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                                    <i class="fas fa-book text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold">${topicName}</h3>
                                    <p class="text-${color}-100 text-sm">Study Notes</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                ${showAIBadge ? '<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs ml-2">AI Generated</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        ${formatContent(displayContent)}
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        html += '<div class="text-center text-gray-500 py-8">No notes available. Upload syllabus and try again.</div>';
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}


/*QUESTIONS RENDERING*/
function renderQuestions() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    let html = `
        <div class="questions-container">
            <!-- Simple Header -->
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-gray-800 mb-2">
                    <i class="fas fa-question-circle text-blue-600 mr-2"></i>
                    Exam Questions
                </h1>
                <p class="text-gray-600">Strategic questions designed to maximize your exam performance</p>
            </div>
    `;

    const topicNames = Object.keys(appState.likelyQuestions);
    if (topicNames.length > 0) {
        // Simple Stats
        const totalQuestions = topicNames.reduce((sum, topic) => {
            const questions = appState.likelyQuestions[topic];
            let content = questions.content;

            // Handle both string and array content
            if (Array.isArray(content)) {
                content = content.join('\n');
            }

            const questionCount = (content.match(/^\d+\./gm) || []).length;
            return sum + questionCount;
        }, 0);

        html += `
            <div class="stats-dashboard grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-blue-700 text-sm font-medium">Total Questions</p>
                            <p class="text-2xl font-bold text-blue-800">${totalQuestions}</p>
                        </div>
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-question text-blue-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-green-700 text-sm font-medium">Topics Covered</p>
                            <p class="text-2xl font-bold text-green-800">${topicNames.length}</p>
                        </div>
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-book text-green-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-purple-700 text-sm font-medium">Study Progress</p>
                            <p class="text-2xl font-bold text-purple-800">100%</p>
                        </div>
                        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-chart-line text-purple-600"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Clean Questions Layout
        html += '<div class="questions-grid space-y-6">';

        topicNames.forEach((topicName, topicIndex) => {
            const questions = appState.likelyQuestions[topicName];
            let content = questions.content;

            // Handle both string and array content
            if (Array.isArray(content)) {
                content = content.join('\n');
            }

            const questionList = content.split('\n').filter(line => line.trim() && /^\d+\./.test(line.trim()));
            const questionCount = questionList.length;

            html += `
                <div class="question-card bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <!-- Simple Header -->
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-700">
                                    ${topicIndex + 1}
                                </div>
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-800">${topicName}</h3>
                                    <p class="text-gray-600 text-sm">
                                        <i class="fas fa-list mr-1"></i>
                                        ${questionCount} Questions
                                    </p>
                                </div>
                            </div>
                            ${questions.source === 'ai' ? '<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">AI Generated</span>' : ''}
                        </div>
                    </div>

                    <!-- Questions Content -->
                    <div class="p-6">
                        <div class="space-y-3">
                            ${formatQuestionsContent(content)}
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        html += `
            <div class="text-center py-16">
                <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-question text-4xl text-gray-400"></i>
                </div>
                <h3 class="text-xl font-semibold text-gray-800 mb-3">No Questions Yet</h3>
                <p class="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload your previous year question papers to unlock personalized exam questions
                </p>
                <button onclick="document.getElementById('pyqInput').click()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    <i class="fas fa-upload mr-2"></i>Upload PYQ Papers
                </button>
            </div>
        `;
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

/*MCQS RENDERING*/
function renderMCQs() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    const topicNames = Object.keys(appState.mcqs);

    let html = `
        <div class="mcqs-container space-y-6">
            <!-- Light Header -->
            <div class="text-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800 mb-2 flex items-center justify-center">
                    <i class="fas fa-tasks text-blue-600 mr-3"></i>
                    Multiple Choice Questions
                </h2>
                <p class="text-gray-600 text-sm">Test your knowledge with interactive MCQs</p>
            </div>
    `;

    if (topicNames.length > 0) {
        const totalMCQs = topicNames.reduce((sum, topic) => {
            const mcqData = appState.mcqs[topic];
            if (Array.isArray(mcqData.content) && mcqData.content.length > 0) {
                return sum + mcqData.content.length;
            }
            return sum;
        }, 0);

        const topicsWithMCQs = topicNames.filter(topic => {
            const mcqData = appState.mcqs[topic];
            return Array.isArray(mcqData.content) && mcqData.content.length > 0;
        }).length;

        if (totalMCQs > 0) {
            html += `
                <div class="stats-dashboard grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-blue-700 text-sm font-medium">Total MCQs</p>
                                <p class="text-2xl font-bold text-blue-800">${totalMCQs}</p>
                            </div>
                            <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-question text-blue-600"></i>
                            </div>
                        </div>
                    </div>
                    <div class="bg-green-50 border border-green-200 p-4 rounded-lg">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-green-700 text-sm font-medium">Topics Covered</p>
                                <p class="text-2xl font-bold text-green-800">${topicsWithMCQs}</p>
                            </div>
                            <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-book text-green-600"></i>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // MCQ Cards Grid
        html += '<div class="mcqs-grid space-y-6">';

        topicNames.forEach((topicName, topicIndex) => {
            const mcqData = appState.mcqs[topicName];
            const colors = ['blue', 'green', 'purple', 'indigo', 'teal', 'cyan'];
            const color = colors[topicIndex % colors.length];

            html += `
                <div class="mcq-topic-card bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <!-- Topic Header -->
                    <div class="bg-gradient-to-r from-${color}-600 to-${color}-700 p-6 text-white">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                                    <i class="fas fa-tasks text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold">${topicName}</h3>
                                    <p class="text-${color}-100 text-sm">${Array.isArray(mcqData.content) ? mcqData.content.length : 0} MCQs</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                ${mcqData.source === 'ai' ? '<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs ml-2">AI Generated</span>' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- MCQ Content -->
                    <div class="p-6">
                        <div class="space-y-6">
            `;

            if (Array.isArray(mcqData.content)) {
                mcqData.content.forEach((mcq, index) => {
                    // Escape backticks and single quotes for safe template literal usage
                    const safeQuestion = mcq.question.replace(/`/g, '\\`').replace(/'/g, "\\'");
                    const safeAnswer = mcq.answer.replace(/`/g, '\\`').replace(/'/g, "\\'");
                    const safeExplanation = mcq.explanation.replace(/`/g, '\\`').replace(/'/g, "\\'");

                    html += `
                        <div class="mcq-card bg-white rounded-lg p-4 border border-gray-200 mb-4">
                            <div class="flex items-start space-x-3 mb-3">
                                <div class="w-6 h-6 bg-${color}-100 rounded-full flex items-center justify-center text-xs font-bold text-${color}-700 flex-shrink-0">
                                    ${index + 1}
                                </div>
                                <div class="flex-1">
                                    <h4 class="text-base font-medium text-gray-800 leading-relaxed">${safeQuestion}</h4>
                                </div>
                            </div>

                            <div class="space-y-2 mb-3">
                    `;
                    mcq.options.forEach((option, optIndex) => {
                        const letter = String.fromCharCode(65 + optIndex);
                        const isCorrect = option === mcq.answer;
                        const safeOption = option.replace(/`/g, '\\`').replace(/'/g, "\\'");
                        html += `
                            <div class="mcq-option flex items-center space-x-2 p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50 transition-colors ${isCorrect ? 'correct' : ''}"
                                 onclick="revealMCQAnswer(this, '${safeAnswer}', '${safeExplanation}')">
                                <span class="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">${letter}</span>
                                <span class="text-gray-700 text-sm">${safeOption}</span>
                            </div>
                        `;
                    });
                    html += `
                            </div>

                            <div class="answer-explanation hidden bg-green-50 border border-green-200 rounded p-3">
                                <div class="flex items-start space-x-2">
                                    <div class="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                        <i class="fas fa-check text-white text-xs"></i>
                                    </div>
                                    <div class="flex-1">
                                        <h5 class="font-medium text-green-800 text-sm mb-1">Correct Answer: ${safeAnswer}</h5>
                                        <p class="text-green-700 text-xs leading-relaxed">${safeExplanation}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });
            } else {
                html += formatContent(mcqData.content);
            }

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        // Empty State
        html += `
            <div class="text-center py-16">
                <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-tasks text-4xl text-gray-400"></i>
                </div>
                <h3 class="text-xl font-semibold text-gray-800 mb-3">No MCQs Yet</h3>
                <p class="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload your previous year question papers to generate personalized MCQs
                </p>
                <button onclick="document.getElementById('pyqInput').click()" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    <i class="fas fa-upload mr-2"></i>Upload PYQ Papers
                </button>
            </div>
        `;
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

/*REVISION RENDERING*/
function renderRevision() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    const revisionTopics = Object.keys(appState.revision);
    const hasMultipleTopics = revisionTopics.length > 1;

    let html = `
        <div class="revision-container space-y-8">
            <!-- Header Section -->
            <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center">
                    <i class="fas fa-redo text-purple-600 mr-3"></i>
                    Quick Revision Notes
                </h2>
                <p class="text-gray-600">Essential concepts and key points for rapid review</p>
            </div>
    `;

    if (revisionTopics.length > 0) {
        // Stats Dashboard
        const totalPoints = revisionTopics.reduce((sum, topic) => {
            const content = appState.revision[topic].content;
            const bulletPoints = (content.match(/•/g) || []).length;
            return sum + bulletPoints;
        }, 0);

        html += `
            <div class="stats-dashboard grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-purple-700 text-sm font-medium">Revision Topics</p>
                            <p class="text-2xl font-bold text-purple-800">${revisionTopics.length}</p>
                        </div>
                        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-book text-purple-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-blue-700 text-sm font-medium">Key Points</p>
                            <p class="text-2xl font-bold text-blue-800">${totalPoints}</p>
                        </div>
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-list text-blue-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-green-700 text-sm font-medium">Study Progress</p>
                            <p class="text-2xl font-bold text-green-800">100%</p>
                        </div>
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-check-circle text-green-600"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Revision Cards Grid
        html += '<div class="revision-grid space-y-6">';

        revisionTopics.forEach((topicName, index) => {
            const revision = appState.revision[topicName];
            const colors = ['purple', 'blue', 'indigo', 'teal', 'cyan', 'green', 'emerald'];
            const color = colors[index % colors.length];

            html += `
                <div class="revision-card group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-purple-600 to-purple-700 p-6 text-white">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                                    <i class="fas fa-redo text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold">${topicName}</h3>
                                    <p class="text-purple-100 text-sm">Quick Revision</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                ${revision.source === 'ai' ? '<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs ml-2">AI Generated</span>' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="p-6">
                        <div class="revision-content text-gray-800 leading-relaxed">
                            ${formatRevisionContent(revision.content, 'purple')}
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        // Empty State
        html += `
            <div class="text-center py-16">
                <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-redo text-4xl text-gray-400"></i>
                </div>
                <h3 class="text-xl font-semibold text-gray-800 mb-3">No Revision Content Yet</h3>
                <p class="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload your syllabus to generate personalized quick revision notes
                </p>
                <button onclick="document.getElementById('syllabusInput').click()" class="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors font-medium">
                    <i class="fas fa-upload mr-2"></i>Upload Syllabus
                </button>
            </div>
        `;
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

/*TIMETABLE RENDERING*/
function renderTimetable() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    let html = `
        <div class="timetable-container space-y-8">
            <!-- Header Section -->
            <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center">
                    <i class="fas fa-calendar-alt text-blue-600 mr-3"></i>
                    Study Timetable
                </h2>
                <p class="text-gray-600">Your personalized study schedule for exam preparation</p>
            </div>
    `;

    if (appState.timetable.length > 0) {
        // Calculate stats
        const totalDays = appState.timetable.length;
        const totalSessions = appState.timetable.reduce((sum, day) => sum + day.sessions.length, 0);
        const totalHours = appState.timetable.reduce((sum, day) => {
            return sum + day.sessions.reduce((daySum, session) => {
                const timeMatch = session.time.match(/(\d+):(\d+)\s*(AM|PM)\s*-\s*(\d+):(\d+)\s*(AM|PM)/i);
                if (timeMatch) {
                    const startHour = parseInt(timeMatch[1]) + (timeMatch[3].toUpperCase() === 'PM' && timeMatch[1] !== '12' ? 12 : 0) - (timeMatch[3].toUpperCase() === 'AM' && timeMatch[1] === '12' ? 12 : 0);
                    const endHour = parseInt(timeMatch[4]) + (timeMatch[6].toUpperCase() === 'PM' && timeMatch[4] !== '12' ? 12 : 0) - (timeMatch[6].toUpperCase() === 'AM' && timeMatch[4] === '12' ? 12 : 0);
                    return daySum + (endHour - startHour);
                }
                return daySum;
            }, 0);
        }, 0);

        // Stats Dashboard
        html += `
            <div class="stats-dashboard grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-blue-700 text-sm font-medium">Total Days</p>
                            <p class="text-2xl font-bold text-blue-800">${totalDays}</p>
                        </div>
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-calendar-day text-blue-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-green-700 text-sm font-medium">Study Sessions</p>
                            <p class="text-2xl font-bold text-green-800">${totalSessions}</p>
                        </div>
                        <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-clock text-green-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-purple-700 text-sm font-medium">Total Hours</p>
                            <p class="text-2xl font-bold text-purple-800">${totalHours}h</p>
                        </div>
                        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-hourglass-half text-purple-600"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Timetable Days Grid
        html += '<div class="timetable-grid space-y-6">';

        appState.timetable.forEach((day, dayIndex) => {
            const colors = ['blue', 'green', 'purple', 'indigo', 'teal', 'cyan', 'emerald'];
            const color = colors[dayIndex % colors.length];

            html += `
                <div class="day-card group relative overflow-hidden rounded-2xl bg-gradient-to-br from-${color}-50 to-${color}-100 border border-${color}-200 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <!-- Day Header -->
                    <div class="bg-gradient-to-r from-${color}-600 to-${color}-700 p-6 text-white">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                                    <i class="fas fa-calendar-day text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold">Day ${day.day}</h3>
                                    <p class="text-${color}-100 text-sm">${day.date}</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                                    <i class="fas fa-clock mr-1"></i>${day.sessions.length} Sessions
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Sessions List -->
                    <div class="p-6">
                        <div class="space-y-4">
            `;

            day.sessions.forEach((session, sessionIndex) => {
                const priorityConfig = {
                    'high': {
                        color: 'red',
                        icon: 'fas fa-fire',
                        bg: 'bg-red-50',
                        border: 'border-red-200',
                        text: 'text-red-800',
                        badge: 'bg-red-100 text-red-800'
                    },
                    'medium': {
                        color: 'orange',
                        icon: 'fas fa-exclamation-triangle',
                        bg: 'bg-orange-50',
                        border: 'border-orange-200',
                        text: 'text-orange-800',
                        badge: 'bg-orange-100 text-orange-800'
                    },
                    'low': {
                        color: 'green',
                        icon: 'fas fa-check-circle',
                        bg: 'bg-green-50',
                        border: 'border-green-200',
                        text: 'text-green-800',
                        badge: 'bg-green-100 text-green-800'
                    },
                    'revision': {
                        color: 'blue',
                        icon: 'fas fa-redo',
                        bg: 'bg-blue-50',
                        border: 'border-blue-200',
                        text: 'text-blue-800',
                        badge: 'bg-blue-100 text-blue-800'
                    }
                }[session.priority] || {
                    color: 'gray',
                    icon: 'fas fa-clock',
                    bg: 'bg-gray-50',
                    border: 'border-gray-200',
                    text: 'text-gray-800',
                    badge: 'bg-gray-100 text-gray-800'
                };

                html += `
                    <div class="session-card group/item relative overflow-hidden bg-white rounded-xl p-4 border border-gray-100 hover:border-${priorityConfig.color}-300 shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5 hover:scale-[1.02]">
                        <div class="flex items-start space-x-4">
                            <!-- Time Badge -->
                            <div class="flex-shrink-0">
                                <div class="w-16 h-16 bg-gradient-to-r from-${color}-500 to-${color}-600 rounded-xl flex flex-col items-center justify-center text-white shadow-lg">
                                    <i class="fas fa-clock text-sm mb-1"></i>
                                    <span class="text-xs font-bold leading-tight text-center">${session.time.split(' - ')[0]}</span>
                                </div>
                            </div>

                            <!-- Session Details -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-start justify-between mb-2">
                                    <div class="flex-1">
                                        <h4 class="font-semibold text-gray-900 mb-1 leading-tight">${session.topic}</h4>
                                        <p class="text-sm text-gray-600 leading-relaxed">${session.activity}</p>
                                    </div>
                                    <div class="flex items-center space-x-2 ml-4">
                                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${priorityConfig.badge} shadow-sm">
                                            <i class="${priorityConfig.icon} mr-1"></i>
                                            ${session.priority.toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                <!-- Time Duration -->
                                <div class="flex items-center text-xs text-gray-500">
                                    <i class="fas fa-hourglass-half mr-1"></i>
                                    <span>${session.time}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Hover overlay effect -->
                        <div class="absolute inset-0 bg-gradient-to-r from-${color}-500/5 to-${color}-600/5 opacity-0 group-hover/item:opacity-100 transition-opacity duration-300 rounded-xl"></div>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        // Enhanced Empty State
        html += `
            <div class="text-center py-16">
                <div class="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <i class="fas fa-calendar-alt text-4xl text-blue-500"></i>
                </div>
                <h3 class="text-xl font-semibold text-gray-800 mb-3">No Timetable Yet</h3>
                <p class="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload your syllabus and set your time remaining to generate a personalized study timetable
                </p>
                <button onclick="document.getElementById('syllabusInput').click()" class="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    <i class="fas fa-upload mr-2"></i>Create Study Plan
                </button>
            </div>
        `;
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

/*VIDEOS RENDERING*/
function renderVideos() {
    const contentDiv = document.getElementById('tabContent');
    if (!contentDiv) return;

    let html = `
        <div class="videos-container space-y-8">
            <!-- Header Section -->
            <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center">
                    <i class="fab fa-youtube text-red-600 mr-3"></i>
                    Recommended Videos
                </h2>
                <p class="text-gray-600">Curated educational video content for your exam preparation</p>
            </div>
    `;

    const topicNames = Object.keys(appState.videos);
    if (topicNames.length > 0) {
        // Stats Dashboard
        const totalVideos = topicNames.reduce((sum, topic) => {
            return sum + appState.videos[topic].length;
        }, 0);

        const totalDuration = topicNames.reduce((sum, topic) => {
            return sum + appState.videos[topic].reduce((topicSum, video) => {
                const duration = video.duration;
                // Skip videos with non-numeric durations like 'N/A' or 'Varies'
                if (duration === 'N/A' || duration === 'Varies' || !duration) {
                    return topicSum;
                }
                const minutes = duration.includes('h') ?
                    parseInt(duration.split('h')[0]) * 60 + parseInt(duration.split('h')[1].split('m')[0] || 0) :
                    parseInt(duration.split('m')[0] || 0);
                return topicSum + (isNaN(minutes) ? 0 : minutes);
            }, 0);
        }, 0);

        const hours = Math.floor(totalDuration / 60);
        const minutes = totalDuration % 60;

        html += `
            <div class="stats-dashboard grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-red-50 border border-red-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-red-700 text-sm font-medium">Total Videos</p>
                            <p class="text-2xl font-bold text-red-800">${totalVideos}</p>
                        </div>
                        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <i class="fab fa-youtube text-red-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-orange-700 text-sm font-medium">Topics Covered</p>
                            <p class="text-2xl font-bold text-orange-800">${topicNames.length}</p>
                        </div>
                        <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-book text-orange-600"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-purple-700 text-sm font-medium">Total Duration</p>
                            <p class="text-2xl font-bold text-purple-800">${hours}h ${minutes}m</p>
                        </div>
                        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-clock text-purple-600"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Video Cards Grid
        html += '<div class="videos-grid space-y-6">';

        topicNames.forEach((topicName, index) => {
            const videos = appState.videos[topicName];
            const colors = ['red', 'orange', 'purple', 'blue', 'green', 'indigo', 'teal'];
            const color = colors[index % colors.length];

            html += `
                <div class="video-topic-card group relative overflow-hidden rounded-2xl bg-gradient-to-br from-${color}-50 to-${color}-100 border border-${color}-200 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-${color}-600 to-${color}-700 p-6 text-white">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mr-4">
                                    <i class="fab fa-youtube text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold">${topicName}</h3>
                                    <p class="text-${color}-100 text-sm">${videos.length} Video${videos.length > 1 ? 's' : ''} Available</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                                    <i class="fas fa-play-circle mr-1"></i>${videos.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Video List -->
                    <div class="p-6">
                        <div class="space-y-3">
            `;

            videos.forEach((video, videoIndex) => {
                html += `
                    <a href="${video.url}" target="_blank"
                       class="video-card group/item relative overflow-hidden bg-white rounded-xl p-4 border border-${color}-100 hover:border-${color}-300 shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5 hover:scale-[1.02]">
                        <div class="flex items-start space-x-4">
                            <!-- Video Thumbnail/Icon -->
                            <div class="flex-shrink-0 relative">
                                <div class="w-20 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-md">
                                    <i class="fab fa-youtube text-white text-lg"></i>
                                </div>
                                <div class="absolute -top-1 -right-1 w-6 h-6 bg-${color}-500 rounded-full flex items-center justify-center">
                                    <i class="fas fa-play text-white text-xs"></i>
                                </div>
                            </div>

                            <!-- Video Details -->
                            <div class="flex-1 min-w-0">
                                <h4 class="font-semibold text-gray-900 line-clamp-2 mb-2 group-hover/item:text-${color}-700 transition-colors">
                                    ${video.title}
                                </h4>
                                <div class="flex items-center justify-between text-sm text-gray-600">
                                    <div class="flex items-center space-x-4">
                                        <span class="flex items-center">
                                            <i class="fas fa-user-circle mr-1 text-${color}-500"></i>
                                            ${video.channel}
                                        </span>
                                        <span class="flex items-center">
                                            <i class="fas fa-clock mr-1 text-${color}-500"></i>
                                            ${video.duration}
                                        </span>
                                    </div>
                                    <div class="flex items-center text-${color}-600 font-medium">
                                        <span class="mr-1">Watch Now</span>
                                        <i class="fas fa-external-link-alt text-xs"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Hover overlay effect -->
                        <div class="absolute inset-0 bg-gradient-to-r from-${color}-500/5 to-${color}-600/5 opacity-0 group-hover/item:opacity-100 transition-opacity duration-300 rounded-xl"></div>
                    </a>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        // Enhanced Empty State
        html += `
            <div class="text-center py-16">
                <div class="w-24 h-24 bg-gradient-to-br from-red-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <i class="fab fa-youtube text-4xl text-red-500"></i>
                </div>
                <h3 class="text-xl font-semibold text-gray-800 mb-3">No Video Recommendations Yet</h3>
                <p class="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload your syllabus to get personalized educational video recommendations from YouTube
                </p>
                <button onclick="document.getElementById('syllabusInput').click()" class="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    <i class="fas fa-upload mr-2"></i>Upload Syllabus for Videos
                </button>
            </div>
        `;
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

/*HELPER FUNCTIONS*/
function renderTopicCard(topic, priority) {
    const colors = {
        high: 'border-red-300 bg-red-50',
        medium: 'border-orange-300 bg-orange-50',
        low: 'border-green-300 bg-green-50'
    };

    return `
        <div class="topic-card ${colors[priority]} border-l-4 p-4 rounded-r-lg">
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-semibold text-gray-800">${topic.name}</h4>
                <span class="text-sm font-medium px-2 py-1 rounded-full 
                    ${priority === 'high' ? 'bg-red-100 text-red-800' :
                      priority === 'medium' ? 'bg-orange-100 text-orange-800' :
                      'bg-green-100 text-green-800'}">
                    ${priority.toUpperCase()}
                </span>
            </div>
            <p class="text-sm text-gray-600 mb-2">
                Subtopics: ${topic.subtopics ? topic.subtopics.join(', ') : 'N/A'}
            </p>
            <div class="flex justify-between text-xs text-gray-500">
                <span>Frequency: ${topic.frequency}</span>
                <span>Score: ${topic.priority_score.toFixed(1)}</span>
            </div>
        </div>
    `;
}

function formatQuestionsContent(content) {
    if (typeof content === 'string') {
        // Format questions with marks in bubbles
        return content
            .replace(/^\d+\.\s*(.*?)\s*\((\d+)\s*marks?\)\s*$/gm, function(match, question, marks) {
                return `<div class="question-item flex items-start space-x-3 p-3 bg-white border-l-4 border-blue-500 rounded-r-lg shadow-sm mb-3">
                    <div class="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        ${match.match(/^\d+/)[0]}
                    </div>
                    <div class="flex-1 pt-1">
                        <span class="text-gray-800 font-medium leading-relaxed">${question.trim()}</span>
                        <span class="inline-block bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-semibold ml-2 shadow-sm">${marks} marks</span>
                    </div>
                </div>`;
            })
            .replace(/^\d+\.\s*(.*?)\s*$/gm, function(match, question) {
                return `<div class="question-item flex items-start space-x-3 p-3 bg-white border-l-4 border-blue-500 rounded-r-lg shadow-sm mb-3">
                    <div class="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        ${match.match(/^\d+/)[0]}
                    </div>
                    <div class="flex-1 pt-1">
                        <span class="text-gray-800 font-medium leading-relaxed">${question.trim()}</span>
                    </div>
                </div>`;
            })
            .replace(/\n/g, '');
    }
    if (Array.isArray(content)) {
        return content.map(item => `<p>${item}</p>`).join('');
    }
    return String(content);
}

function formatRevisionContent(content, color) {
    // Handle array content
    if (Array.isArray(content)) {
        content = content.map(item => `• ${item}`).join('\n');
    }

    if (typeof content === 'string') {
        // Special formatting for revision content with bullet points
        return content
            // Bullet points with colored checkmarks
            .replace(/^• (.*$)/gm, `<div class="flex items-start space-x-3 mb-3">
                <i class="fas fa-check-circle text-${color}-500 mt-1 flex-shrink-0"></i>
                <span class="text-gray-800 leading-relaxed">$1</span>
            </div>`)
            // Alternative bullet styles
            .replace(/^[-*] (.*$)/gm, `<div class="flex items-start space-x-3 mb-3">
                <i class="fas fa-dot-circle text-${color}-500 mt-1 flex-shrink-0"></i>
                <span class="text-gray-800 leading-relaxed">$1</span>
            </div>`)
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 font-semibold">$1</strong>')
            // Code snippets
            .replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-2 py-1 rounded text-sm font-mono text-red-700">$1</code>')
            // Line breaks
            .replace(/\n/g, '<br>');
    }
    return content;
}

function formatNoteObject(noteObj) {
    // Convert note object to formatted string
    if (!noteObj || typeof noteObj !== 'object') {
        return String(noteObj || '');
    }

    let formatted = '';

    // Handle different object structures
    if (noteObj.definition) {
        formatted += `**Definition:** ${noteObj.definition}\n\n`;
    }

    if (noteObj.key_points && Array.isArray(noteObj.key_points)) {
        formatted += '**Key Points:**\n';
        noteObj.key_points.forEach(point => {
            formatted += `• ${point}\n`;
        });
        formatted += '\n';
    }

    if (noteObj.points && Array.isArray(noteObj.points)) {
        formatted += '**Key Points:**\n';
        noteObj.points.forEach(point => {
            formatted += `• ${point}\n`;
        });
        formatted += '\n';
    }

    if (noteObj.applications && Array.isArray(noteObj.applications)) {
        formatted += '**Applications:**\n';
        noteObj.applications.forEach(app => {
            formatted += `• ${app}\n`;
        });
        formatted += '\n';
    }



    // If no structured content, try to extract from content property
    if (!formatted && noteObj.content) {
        formatted = noteObj.content;
    }

    // Fallback to string representation
    if (!formatted) {
        formatted = JSON.stringify(noteObj, null, 2);
    }

    return formatted.trim();
}

function formatContent(content) {
    if (typeof content === 'string') {
        // Enhanced markdown-like syntax to HTML with styling
        return content
            // Headers with icons and styling
            .replace(/^### (.*$)/gm, '<h4 class="text-base font-bold text-purple-700 mt-6 mb-3 flex items-center"><i class="fas fa-star text-purple-500 mr-2 text-sm"></i>$1</h4>')
            .replace(/^## (.*$)/gm, '<h3 class="text-lg font-bold text-blue-800 mt-6 mb-4 flex items-center"><i class="fas fa-bookmark text-blue-600 mr-2"></i>$1</h3>')
            .replace(/^# (.*$)/gm, '<h2 class="text-xl font-bold text-indigo-900 mt-8 mb-4 flex items-center"><i class="fas fa-graduation-cap text-indigo-700 mr-3"></i>$1</h2>')

            // Bold and italic with colors
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="text-gray-900 font-bold"><em class="text-indigo-700">$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 font-semibold">$1</strong>')

            // Code blocks and inline code
            .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 border-l-4 border-blue-500 p-4 my-4 rounded-r-lg overflow-x-auto"><code class="text-sm text-gray-800 font-mono">$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-2 py-1 rounded text-sm font-mono text-red-700">$1</code>')

            // Blockquotes
            .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-green-500 pl-4 py-2 my-4 bg-green-50 italic text-green-800">$1</blockquote>')

            // Lists with better styling
            .replace(/^\d+\. (.*$)/gm, '<li class="ml-6 mb-2 flex items-start"><span class="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">•</span><span>$1</span></li>')
            .replace(/^• (.*$)/gm, '<li class="ml-6 mb-3 flex items-start"><i class="fas fa-check-circle text-green-500 mr-3 mt-1 flex-shrink-0"></i><span class="text-gray-700">$1</span></li>')
            .replace(/^[-*] (.*$)/gm, '<li class="ml-6 mb-3 flex items-start"><i class="fas fa-dot-circle text-orange-500 mr-3 mt-1 flex-shrink-0"></i><span class="text-gray-700">$1</span></li>')

            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline font-medium" target="_blank">$1 <i class="fas fa-external-link-alt text-xs ml-1"></i></a>')

            // Tables (basic support)
            .replace(/\|([^|\n]+)\|/g, '<td class="border border-gray-300 px-3 py-2">$1</td>')
            .replace(/^\|.*\|$/gm, '<table class="border-collapse border border-gray-300 my-4 w-full">$&</table>')
            .replace(/(<table[^>]*>)([\s\S]*?)(<\/table>)/g, '$1<tr>$2</tr>$3')

            // Horizontal rules
            .replace(/^---+$/gm, '<hr class="my-6 border-t-2 border-gray-300">')

            // Paragraphs and line breaks
            .replace(/\n\n/g, '</p><p class="mb-4 leading-relaxed text-gray-800">')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p class="mb-4 leading-relaxed text-gray-800">')
            .replace(/$/, '</p>')

            // Clean up empty paragraphs
            .replace(/<p[^>]*><\/p>/g, '')
            .replace(/(<p[^>]*>)\s*<br\s*\/?>\s*(<\/p>)/g, '');
    }
    return content;
}

/*NOTIFICATIONS*/
function showNotification(message, type = 'info') {
    const old = document.getElementById('cool-toast');
    if (old) old.remove();

    const config = {
        success: {
            bg: 'linear-gradient(135deg, #22c55e, #16a34a)',
            icon: '✔',
            title: 'Success'
        },
        error: {
            bg: 'linear-gradient(135deg, #ef4444, #b91c1c)',
            icon: '✖',
            title: 'Error'
        },
        warning: {
            bg: 'linear-gradient(135deg, #facc15, #eab308)',
            icon: '⚠',
            title: 'Warning'
        },
        info: {
            bg: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            icon: 'ℹ',
            title: 'Info'
        }
    };

    const toast = document.createElement('div');
    toast.id = 'cool-toast';
    toast.style.background = config[type].bg;

    toast.className = `
        fixed top-16 right-6 z-50
        text-white
        max-w-sm w-full
        px-5 py-4
        rounded-full
        shadow-[0_20px_40px_rgba(0,0,0,0.35)]
        backdrop-blur-xl
        animate-toast-in
    `;

    toast.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="w-10 h-10 flex items-center justify-center
                        bg-white/20 rounded-full text-xl">
                ${config[type].icon}
            </div>

            <div class="flex-1">
                <p class="font-semibold leading-tight">${config[type].title}</p>
                <p class="text-sm opacity-90 leading-snug">${message}</p>
            </div>

            <button
                onclick="this.closest('#cool-toast').remove()"
                class="text-white/70 hover:text-white text-2xl leading-none">
                ×
            </button>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('animate-toast-out');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

/*RESET APP*/
function downloadAllNotes() {
    const topicNames = Object.keys(appState.notes);

    if (topicNames.length === 0) {
        showNotification('No notes available to download', 'warning');
        return;
    }

    // Initialize jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Set up document properties
    doc.setProperties({
        title: 'Study Notes - AI Exam Prep System',
        subject: 'Exam Preparation Notes',
        author: 'AI Exam Prep System',
        keywords: 'study notes, exam prep',
        creator: 'AI Exam Prep System'
    });

    // Add header
    doc.setFontSize(20);
    doc.setTextColor(102, 126, 234); // Purple color
    doc.text('Study Notes - AI Exam Prep System', 20, 30);

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 20, 45);
    doc.text(`Total Topics: ${topicNames.length}`, 20, 55);

    let yPosition = 70;

    topicNames.forEach((topicName, index) => {
        const note = appState.notes[topicName];

        // Check if we need a new page
        if (yPosition > 250) {
            doc.addPage();
            yPosition = 30;
        }

        // Topic header
        doc.setFontSize(16);
        doc.setTextColor(102, 126, 234);
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${topicName}`, 20, yPosition);
        yPosition += 15;

        // Topic content
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        // Split content into lines that fit the page width
        const pageWidth = doc.internal.pageSize.width;
        const margin = 20;
        const maxWidth = pageWidth - 2 * margin;

        let content = note.content;
        // Remove markdown formatting for PDF
        content = content.replace(/#{1,6}\s*/g, ''); // Remove headers
        content = content.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold
        content = content.replace(/\*(.*?)\*/g, '$1'); // Remove italic
        content = content.replace(/`([^`]+)`/g, '$1'); // Remove inline code
        content = content.replace(/```[\s\S]*?```/g, ''); // Remove code blocks
        content = content.replace(/^\s*[-*+]\s+/gm, '• '); // Convert lists to bullets
        content = content.replace(/^\s*\d+\.\s+/gm, '• '); // Convert numbered lists to bullets

        const lines = doc.splitTextToSize(content, maxWidth);

        lines.forEach(line => {
            if (yPosition > 270) {
                doc.addPage();
                yPosition = 30;
            }
            doc.text(line, 20, yPosition);
            yPosition += 6;
        });

        yPosition += 10; // Add space between topics

        // Add a separator line
        if (yPosition < 270) {
            doc.setDrawColor(200, 200, 200);
            doc.line(20, yPosition, pageWidth - 20, yPosition);
            yPosition += 10;
        }
    });

    // Save the PDF
    const fileName = `exam_prep_notes_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    showNotification('Notes downloaded successfully as PDF!', 'success');
}

function resetApp() {
    // Reset app state to initial values
    appState = {
        syllabusFile: null,
        pyqFiles: [],
        days: 7,
        hours: 0,
        mode: 'normal',
        topics: [],
        questions: [],
        priorities: { high: [], medium: [], low: [] },
        notes: {},
        likelyQuestions: {},
        mcqs: {},
        revision: {},
        timetable: [],
        videos: {},
        currentTab: 'priorities'
    };

    // Reset UI sections
    uploadSection.classList.remove('hidden');
    loadingSection.classList.add('hidden');
    dashboardSection.classList.add('hidden');

    // Clear file inputs
    document.getElementById('syllabusInput').value = '';
    document.getElementById('pyqInput').value = '';

    // Reset file name displays
    document.getElementById('syllabusFileName').classList.add('hidden');
    document.getElementById('pyqFileName').classList.add('hidden');

    // Reset time inputs
    daysInput.value = 7;
    hoursInput.value = 0;

    // Reset mode preview
    updateModePreview();

    // Reset stats
    updateStats();

    // Switch to priorities tab
    switchTab('priorities');

    // Show success notification
    showNotification('Application reset successfully', 'success');
}

/*BACKEND CONNECTIVITY CHECK*/
async function checkBackendConnectivity() {
    const badge = document.getElementById('backendStatusBadge');
    if (!badge) return;

    try {
        const response = await fetch(`${API_BASE}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (response.ok) {
            updateBackendStatusUI('connected');
        } else {
            updateBackendStatusUI('disconnected');
        }
    } catch (error) {
        console.log('Backend connectivity check failed:', error);
        updateBackendStatusUI('disconnected');
    }
}

/*INIT*/
updateModePreview();
document.addEventListener('DOMContentLoaded', () => {
    checkBackendConnectivity();
    // Check connectivity every 30 seconds
    setInterval(checkBackendConnectivity, 30000);
});


/*MODE + BACKEND STATUS*/
function updateBackendStatusUI(status) {
    const badge = document.getElementById('backendStatusBadge');

    if (!badge) return;

    const icon = badge.querySelector('i');
    const text = badge.querySelector('span');

    if (status === 'connected') {
        badge.className = 'bg-green-100 px-3 py-2 rounded-full text-sm font-medium flex items-center mr-2';
        if (icon) icon.className = 'fas fa-circle text-green-500 mr-2 text-xs';
        if (text) text.className = 'text-green-700';
        if (text) text.textContent = 'Online';
    } else if (status === 'disconnected') {
        badge.className = 'bg-red-100 px-3 py-2 rounded-full text-sm font-medium flex items-center mr-2';
        if (icon) icon.className = 'fas fa-circle text-red-500 mr-2 text-xs';
        if (text) text.className = 'text-red-700';
        if (text) text.textContent = 'Offline';
    } else {
        badge.className = 'bg-yellow-100 px-3 py-2 rounded-full text-sm font-medium flex items-center mr-2';
        if (icon) icon.className = 'fas fa-circle text-yellow-500 mr-2 text-xs';
        if (text) text.className = 'text-yellow-700';
        if (text) text.textContent = 'Checking...';
    }
}

/*MCQ ANSWER REVEAL FUNCTION*/
function revealMCQAnswer(optionElement, correctAnswer, explanation) {
    // Find the parent MCQ card
    const mcqCard = optionElement.closest('.mcq-card');
    if (!mcqCard) return;

    // Find all options in this MCQ
    const allOptions = mcqCard.querySelectorAll('.mcq-option');

    // Remove any existing correct/incorrect styling
    allOptions.forEach(opt => {
        opt.classList.remove('bg-green-100', 'border-green-500', 'bg-red-100', 'border-red-500');
    });

    // Mark the selected option
    const isCorrect = optionElement.textContent.trim().includes(correctAnswer);
    if (isCorrect) {
        optionElement.classList.add('bg-green-100', 'border-green-500');
    } else {
        optionElement.classList.add('bg-red-100', 'border-red-500');
        // Also highlight the correct answer
        allOptions.forEach(opt => {
            if (opt.textContent.trim().includes(correctAnswer)) {
                opt.classList.add('bg-green-100', 'border-green-500');
            }
        });
    }

    // Show the explanation
    const explanationDiv = mcqCard.querySelector('.answer-explanation');
    if (explanationDiv) {
        explanationDiv.classList.remove('hidden');
    }
}
 
