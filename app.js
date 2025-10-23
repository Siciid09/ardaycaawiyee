// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, where, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDuqswofpquk8aUbCOZCGjdYLUivBEh7a8", // Replace with your actual config
    authDomain: "ardaycaawiye-18b89.firebaseapp.com",
    projectId: "ardaycaawiye-18b89",
    storageBucket: "ardaycaawiye-18b89.appspot.com",
    messagingSenderId: "590874185284",
    appId: "1:590874185284:web:6ee7df602c45068e38b611"
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

// --- DOM Elements ---
const header = document.getElementById('header');
const sections = document.querySelectorAll('main > section'); // Used only on index.html
const navLinks = document.querySelectorAll('.nav-link');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

// Auth & Nav Buttons
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const mobileSignupBtn = document.getElementById('mobile-signup-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
const downloadBtn = document.getElementById('download-btn');
const adminDashboardBtn = document.getElementById('admin-dashboard-btn');
const mobileDownloadBtn = document.getElementById('mobile-download-btn');
const mobileAdminDashboardBtn = document.getElementById('mobile-admin-dashboard-btn');

// Modal Elements
const comingSoonModal = document.getElementById('coming-soon-modal');
const closeComingSoonBtn = document.getElementById('close-coming-soon-btn');
const comingSoonOkBtn = document.getElementById('coming-soon-ok-btn');
const pdfModal = document.getElementById('pdf-preview-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

// Dynamic Link Elements
const appleStoreLinks = document.querySelectorAll('.apple-store-link');
const googlePlayLinks = document.querySelectorAll('.google-play-link');
const whatsappLinks = document.querySelectorAll('.whatsapp-link');
const whatsappText = document.getElementById('whatsapp-text'); // Specific text element in Contact

// --- Global State ---
let allExams = [];
let currentExamPage = 1;
const examsPerPage = 12;

let allBooks = [];
let currentBookPage = 1;
const booksPerPage = 12;

let allBlogPosts = []; // Cache for blog posts on blog.html
let currentUser = null; // Cache for current user state
let commentsUnsubscribe = null; // Firestore listener for comments

// =========================================================================
// Initialization and Core Logic
// =========================================================================

// --- Determine Current Page ---
const currentPage = window.location.pathname.split('/').pop() || 'index.html';

// --- Load Dynamic Site Settings ---
async function loadSiteSettings() {
    console.log("Loading site settings...");
    try {
        const settingsRef = doc(db, "settings", "siteConfig");
        const docSnap = await getDoc(settingsRef);

        let settings = {
            googlePlayUrl: "https://play.google.com/store/apps/details?id=com.ardaycaawiye.app", // Default
            appStoreUrl: "#", // Default (triggers Coming Soon)
            whatsappUrl: "https://wa.me/252633227084", // Default
            whatsappDisplay: "+252 63 3227084" // Default
        };

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Fetched settings:", data);
            settings.googlePlayUrl = data.googlePlayUrl || settings.googlePlayUrl;
            settings.appStoreUrl = data.appStoreUrl || settings.appStoreUrl;
            settings.whatsappUrl = data.whatsappUrl || settings.whatsappUrl;
            settings.whatsappDisplay = data.whatsappDisplay || settings.whatsappUrl.replace('https://wa.me/', '+').replace(/[^+\d]/g, ''); // Extract number
        } else {
             console.log("siteConfig document not found, using defaults.");
        }
        
        // Apply settings to all relevant links
        googlePlayLinks.forEach(link => link.href = settings.googlePlayUrl);
        whatsappLinks.forEach(link => link.href = settings.whatsappUrl);
        if (whatsappText) whatsappText.textContent = settings.whatsappDisplay;
        
        // App Store links trigger the "Coming Soon" modal unless a valid URL is set
        appleStoreLinks.forEach(link => {
            if (settings.appStoreUrl && settings.appStoreUrl !== "#") {
                link.href = settings.appStoreUrl;
                // Remove existing listener if needed (safer)
                link.removeEventListener('click', showComingSoonPopup);
            } else {
                 link.href = "#"; // Ensure it doesn't navigate
                 link.addEventListener('click', showComingSoonPopup);
            }
        });

    } catch (error) {
        console.error("Error loading site settings:", error);
        // Fallback to defaults if fetch fails
        appleStoreLinks.forEach(link => {
             link.href = "#";
             link.addEventListener('click', showComingSoonPopup);
        });
        googlePlayLinks.forEach(link => link.href = "https://play.google.com/store/apps/details?id=com.ardaycaawiye.app");
        whatsappLinks.forEach(link => link.href = "https://wa.me/252633227084");
        if (whatsappText) whatsappText.textContent = "+252 63 3227084";
    }
}

// --- Auth State Change Listener (Handles Admin Check) ---
onAuthStateChanged(auth, async (user) => {
    currentUser = user; // Store user state globally
    let isLoggedIn = !!user;
    let isAdmin = false;

    if (isLoggedIn) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
                isAdmin = true;
                console.log("User is Admin");
            } else {
                 console.log("User is logged in but not Admin");
            }
        } catch (error) {
            console.error("Error checking admin role:", error);
        }
    } else {
         console.log("User is not logged in");
    }
    
    updateNavUI(isLoggedIn, isAdmin);

    // If on login page and logged in, redirect to home
    if (isLoggedIn && currentPage === 'login.html') {
         window.location.href = 'index.html';
         return; // Stop further processing on this page
    }

    // Refresh comment form if on post page
    if (currentPage === 'post.html') {
        const postId = getCurrentPostIdFromUrl();
        if (postId) {
            renderCommentForm(postId, user);
        }
    }
});

function updateNavUI(isLoggedIn, isAdmin) {
    // Show/Hide appropriate buttons based on admin status
    if (isAdmin) {
        [downloadBtn, mobileDownloadBtn].forEach(el => el?.classList.add('hidden'));
        [adminDashboardBtn, mobileAdminDashboardBtn].forEach(el => el?.classList.remove('hidden'));
    } else {
        [downloadBtn, mobileDownloadBtn].forEach(el => el?.classList.remove('hidden'));
        [adminDashboardBtn, mobileAdminDashboardBtn].forEach(el => el?.classList.add('hidden'));
    }

    // Handle signup/logout buttons
    [signupBtn, mobileSignupBtn].forEach(el => el?.classList.toggle('hidden', isLoggedIn));
    [logoutBtn, mobileLogoutBtn].forEach(el => el?.classList.toggle('hidden', !isLoggedIn));

     // Update text on Signup/Signin buttons
     const signinText = "SIGN IN";
     const signupText = "SIGN UP"; // Or keep as SIGN IN if preferred
     if (signupBtn) signupBtn.textContent = isLoggedIn ? '' : signinText;
     if (mobileSignupBtn) mobileSignupBtn.textContent = isLoggedIn ? '' : signinText;
}

// Add logout functionality
[logoutBtn, mobileLogoutBtn].forEach(btn => {
    if(btn) btn.addEventListener('click', () => signOut(auth));
});

// =========================================================================
// Page-Specific Logic
// =========================================================================

// --- Logic for index.html (SPA Sections) ---
if (currentPage === 'index.html' || currentPage === '') {
    // --- SPA Navigation (Only for index.html sections) ---
    const showSection = (hash) => {
        const targetId = hash ? hash.substring(1) : 'home';
        
        // Find the section element only within the index page's main
        const mainElement = document.querySelector('main');
        const sectionsNodeList = mainElement ? mainElement.querySelectorAll('section') : [];
        
        sectionsNodeList.forEach(s => { s.style.display = 'none'; });
        
        const sectionToShow = document.getElementById(targetId);
        
        if (sectionToShow) {
             sectionToShow.style.display = 'block';
             // Only scroll if it's not the initial load of #home
             if (targetId !== 'home' || window.location.hash) {
                 // Slightly delay scroll to allow content to render
                 setTimeout(() => {
                    const headerHeight = header ? header.offsetHeight : 80; // Estimate header height
                    const elementPosition = sectionToShow.getBoundingClientRect().top + window.pageYOffset;
                    const offsetPosition = elementPosition - headerHeight - 20; // Adjust offset
                    
                     window.scrollTo({ 
                        top: offsetPosition, 
                        behavior: 'smooth' 
                     });
                 }, 100);
             }
             updateActiveNavForSPA(targetId); // Use SPA-specific nav update

            // Load content if not already loaded (original logic)
            const isLoaded = sectionToShow.dataset.loaded === 'true';
             if (!isLoaded && targetId !== 'home') { // Home content loads separately
                 if (targetId === 'exams') loadExamsData();
                 if (targetId === 'books') loadBooksData();
                 if (targetId === 'scholarships') loadScholarshipsData();
                 // Blog section on homepage is just a preview, handled by loadHomeBlogPosts
                 // About and Contact are static HTML
                 sectionToShow.dataset.loaded = 'true';
             }
        } else if (targetId === 'home') {
             // Ensure #home section is shown if no other section matches
             const homeSection = document.getElementById('home');
             if (homeSection) homeSection.style.display = 'block';
             updateActiveNavForSPA('home');
        } else {
             // Fallback if targetId doesn't exist (e.g., broken link)
             const homeSection = document.getElementById('home');
             if (homeSection) homeSection.style.display = 'block';
              updateActiveNavForSPA('home');
        }
    };

    const updateActiveNavForSPA = (activeId) => {
         // Reset all nav links first
         document.querySelectorAll('header nav a, #mobile-menu a').forEach(link => {
             link.classList.remove('active-nav');
         });

         let activeLinkSelector;
        if (['exams', 'books', 'scholarships', 'about', 'contact'].includes(activeId)) {
            activeLinkSelector = `header nav a[href="#${activeId}"], #mobile-menu a[href="#${activeId}"]`;
        } else {
             activeLinkSelector = `header nav a[href="index.html"], #mobile-menu a[href="index.html"]`; // Default to HOME
        }
        
         document.querySelectorAll(activeLinkSelector).forEach(link => {
             link.classList.add('active-nav');
         });
    };

    // Event listeners specific to index.html SPA navigation
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            // Only handle hash links for SPA sections on index.html
            if (href && href.startsWith('#')) {
                e.preventDefault();
                // Update hash without adding to history stack for cleaner navigation
                // history.replaceState(null, null, href); 
                 // Or use pushState if you want back/forward to navigate sections
                 history.pushState(null, null, href); 
                showSection(href);
                if (mobileMenu) mobileMenu.classList.add('hidden'); // Close mobile menu
            } 
            // Let full page links (like blog.html) navigate normally
        });
    });

     // Handle back/forward buttons for SPA sections
     window.addEventListener('popstate', () => showSection(window.location.hash || '#home'));

    // Initial section display on index.html load
    showSection(window.location.hash || '#home');

     // Load initial homepage content (previews)
     loadHomeExamsPreview();
     loadHomeBooksPreview();
     // loadHomeBlogPostsPreview(); // Add this if you want blog preview too
     setupCarousel(); // Setup carousel only on index

     // Load data for SPA sections if they exist
     if (document.getElementById('exams')) initializeExamsSection();
     if (document.getElementById('books')) initializeBooksSection();
     if (document.getElementById('scholarships')) loadScholarshipsData(); // Static data, load directly

} else if (currentPage === 'blog.html') {
    // --- Logic for blog.html ---
    loadBlogList();

} else if (currentPage === 'post.html') {
    // --- Logic for post.html ---
    const postId = getCurrentPostIdFromUrl();
    if (postId) {
        loadSinglePost(postId);
        // Comments are loaded within loadSinglePost after content is ready
    } else {
        // Handle case where no slug is provided
        const container = document.getElementById('post-content-container');
        if (container) container.innerHTML = '<h1 class="text-3xl font-bold text-red-600">Error: Blog post not specified.</h1><p>Please return to the blog list.</p>';
    }
} else if (currentPage === 'login.html') {
     // --- Logic for login.html ---
     // The onAuthStateChanged handles redirecting if already logged in.
     // Render the login form initially.
     renderAuthForm(true); // Assuming login.html always starts with login view
}

// =========================================================================
// Data Loading Functions (Called by Page-Specific Logic)
// =========================================================================

// --- Homepage Preview Loaders ---
async function loadHomeExamsPreview() {
    const container = document.getElementById('home-exams-list');
    if (!container) return; // Only run if element exists
    container.innerHTML = createPlaceholder(8, 'exam');
    try {
        const q = query(collection(db, "exams"), orderBy("year", "desc"), limit(8));
        const querySnapshot = await getDocs(q);
        let html = '';
        if (querySnapshot.empty) {
            html = '<p class="col-span-full text-center text-gray-500">No recent exams found.</p>';
        } else {
            querySnapshot.forEach((doc) => {
                const exam = doc.data();
                const title = exam.title || `${exam.subject || 'Exam'} - ${exam.year || ''}`;
                html += `<a href="#" onclick="showPdfPreviewModal(null, '${title.replace(/'/g, "\\'")}')" class="group flex flex-col justify-between bg-white p-5 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1.5 transition-all duration-300"><div><h4 class="font-bold text-lg">${title}</h4><p class="text-gray-500 text-sm">Year: ${exam.year}</p></div><div class="mt-4 text-left"><span class="inline-block bg-blue-100 text-blue-700 text-sm font-bold px-4 py-1 rounded-full group-hover:bg-blue-600 group-hover:text-white">View Details</span></div></a>`;
            });
        }
        container.innerHTML = html;
        lucide.createIcons(); // Re-render icons if needed
    } catch (error) {
        console.error("Error loading home exams:", error);
        container.innerHTML = '<p class="col-span-full text-center text-red-500">Could not load exams.</p>';
    }
}

async function loadHomeBooksPreview() {
    const container = document.getElementById('home-books-list');
     if (!container) return;
    container.innerHTML = createPlaceholder(6, 'book');
    try {
        const q = query(collection(db, "generalBooks"), limit(6));
        const querySnapshot = await getDocs(q);
        let html = '';
        if (querySnapshot.empty) {
            html = '<p class="col-span-full text-center text-gray-500">No books found.</p>';
        } else {
            querySnapshot.forEach((doc) => {
                const book = doc.data();
                html += `<div class="bg-gray-50 rounded-lg shadow-md overflow-hidden flex flex-col group">
                    <img src="${book.coverImageUrl || 'https://placehold.co/400x600/e2e8f0/4a5568?text=No+Cover'}" alt="${book.title}" class="h-56 w-full object-cover">
                    <div class="p-4 flex flex-col flex-grow justify-between">
                        <div>
                            <h4 class="font-bold truncate group-hover:text-blue-600">${book.title}</h4>
                            <p class="text-sm text-gray-500">${book.author || 'Unknown Author'}</p>
                        </div>
                        <button onclick="showPdfPreviewModal(null, '${book.title.replace(/'/g, "\\'")}')" class="mt-4 text-blue-600 font-semibold text-sm text-left self-start">Read Now →</button>
                    </div>
                </div>`;
            });
        }
        container.innerHTML = html;
        lucide.createIcons();
    } catch (error) {
         console.error("Error loading home books:", error);
         container.innerHTML = '<p class="col-span-full text-center text-red-500">Could not load books.</p>';
    }
}

// --- Full Data Loaders for SPA Sections ---
async function loadExamsData() {
    const container = document.getElementById('exams-list');
    if(!container) return;
    container.innerHTML = createPlaceholder(12, 'exam');

    try {
        const q = query(collection(db, "exams"), orderBy("year", "desc"));
        const querySnapshot = await getDocs(q);
        
        allExams = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const years = [...new Set(allExams.map(e => e.year))].filter(Boolean).sort((a,b) => b-a);
        const subjects = [...new Set(allExams.map(e => e.subject))].filter(Boolean).sort();
        const yearFilter = document.getElementById('exam-year-filter');
        const subjectFilter = document.getElementById('exam-subject-filter');
        if (yearFilter) yearFilter.innerHTML = '<option value="">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
        if (subjectFilter) subjectFilter.innerHTML = '<option value="">All Subjects</option>' + subjects.map(s => `<option value="${s}">${s}</option>`).join('');
        
        renderFilteredExams(); // Render initial list
    } catch (error) {
         console.error("Error loading exams data:", error);
         if (container) container.innerHTML = '<p class="col-span-full text-center text-red-500">Could not load exams.</p>';
    }
}

function initializeExamsSection() {
     const searchInput = document.getElementById('exam-search');
     const yearFilter = document.getElementById('exam-year-filter');
     const subjectFilter = document.getElementById('exam-subject-filter');

     if (searchInput) searchInput.addEventListener('input', () => { currentExamPage = 1; renderFilteredExams(); });
     if (yearFilter) yearFilter.addEventListener('change', () => { currentExamPage = 1; renderFilteredExams(); });
     if (subjectFilter) subjectFilter.addEventListener('change', () => { currentExamPage = 1; renderFilteredExams(); });
     
     loadExamsData(); // Initial data load
}

function renderFilteredExams() {
    const container = document.getElementById('exams-list');
    if (!container) return;

    const searchVal = document.getElementById('exam-search')?.value.toLowerCase() || '';
    const yearVal = document.getElementById('exam-year-filter')?.value || '';
    const subjectVal = document.getElementById('exam-subject-filter')?.value || '';
    
    const filteredExams = allExams.filter(exam => {
        const title = exam.title || `${exam.subject || ''} ${exam.year || ''}`;
        const titleMatch = title.toLowerCase().includes(searchVal);
        const yearMatch = !yearVal || exam.year == yearVal;
        const subjectMatch = !subjectVal || exam.subject == subjectVal;
        return titleMatch && yearMatch && subjectMatch;
    });

    const totalPages = Math.ceil(filteredExams.length / examsPerPage);
    const startIndex = (currentExamPage - 1) * examsPerPage;
    const paginatedExams = filteredExams.slice(startIndex, startIndex + examsPerPage);

    let html = '';
    if(paginatedExams.length === 0) {
         html = '<p class="col-span-full text-center text-gray-500 py-10">No exams match your criteria.</p>';
    } else {
        paginatedExams.forEach(exam => {
            const imageUrl = exam.coverImageUrl ? exam.coverImageUrl : getSubjectIconUrl(exam.subject);
            const title = exam.title || `${exam.subject || 'Exam'} - ${exam.year || ''}`;

            html += `<div class="bg-white p-4 rounded-xl border shadow-sm flex items-center gap-4 group hover:border-blue-500 transition-all duration-200">
                        <img src="${imageUrl}" alt="${exam.subject || 'Exam'}" class="w-20 h-24 object-cover rounded-md flex-shrink-0 bg-gray-200">
                        <div class="flex flex-col justify-between h-full w-full">
                            <div>
                                <h4 class="font-bold text-md leading-tight group-hover:text-blue-600">${title}</h4>
                                <p class="text-gray-500 text-sm mt-1">Subject: ${exam.subject || 'General'} | Year: ${exam.year}</p>
                            </div>
                            <button onclick="showPdfPreviewModal(null, '${title.replace(/'/g, "\\'")}')" class="mt-2 text-blue-600 font-semibold hover:underline text-left self-start">View Now →</button>
                        </div>
                    </div>`;
         });
    }
    container.innerHTML = html;
    lucide.createIcons();
    
    const paginationContainer = document.getElementById('exams-pagination');
    if (paginationContainer) {
        renderPagination(totalPages, 'exams-pagination', (page) => { 
             currentExamPage = page; 
             renderFilteredExams(); 
             // Scroll to top of list smoothly
             const listTop = container.offsetTop;
             const headerHeight = header ? header.offsetHeight : 80;
             window.scrollTo({top: listTop - headerHeight - 20, behavior: 'smooth'}); 
        });
    }
}

async function loadBooksData() {
    const container = document.getElementById('books-list');
    if (!container) return;
    container.innerHTML = createPlaceholder(8, 'book');

    try {
        const querySnapshot = await getDocs(collection(db, "generalBooks"));
        allBooks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const subjects = [...new Set(allBooks.map(b => b.subject))].filter(Boolean).sort();
        const subjectFilter = document.getElementById('book-subject-filter');
        if (subjectFilter) subjectFilter.innerHTML = '<option value="">All Subjects</option>' + subjects.map(s => `<option value="${s}">${s}</option>`).join('');

        renderFilteredBooks(); // Render initial list
    } catch (error) {
        console.error("Error loading books data:", error);
        if (container) container.innerHTML = '<p class="col-span-full text-center text-red-500">Could not load books.</p>';
    }
}

function initializeBooksSection() {
    const searchInput = document.getElementById('book-search');
    const subjectFilter = document.getElementById('book-subject-filter');

    if (searchInput) searchInput.addEventListener('input', () => { currentBookPage = 1; renderFilteredBooks(); });
    if (subjectFilter) subjectFilter.addEventListener('change', () => { currentBookPage = 1; renderFilteredBooks(); });

    loadBooksData(); // Initial data load
}

function renderFilteredBooks() {
    const container = document.getElementById('books-list');
    if (!container) return;

    const searchVal = document.getElementById('book-search')?.value.toLowerCase() || '';
    const subjectVal = document.getElementById('book-subject-filter')?.value || '';

    const filteredBooks = allBooks.filter(book => {
        const titleMatch = (book.title || '').toLowerCase().includes(searchVal);
        const authorMatch = (book.author || '').toLowerCase().includes(searchVal);
        const subjectMatch = !subjectVal || book.subject == subjectVal;
        return (titleMatch || authorMatch) && subjectMatch;
    });

    const totalPages = Math.ceil(filteredBooks.length / booksPerPage);
    const startIndex = (currentBookPage - 1) * booksPerPage;
    const paginatedBooks = filteredBooks.slice(startIndex, startIndex + booksPerPage);

    let html = '';
    if (paginatedBooks.length === 0) {
        html = '<p class="col-span-full text-center text-gray-500 py-10">No books match your criteria.</p>';
    } else {
        paginatedBooks.forEach(book => {
            html += `<div class="bg-white rounded-lg shadow-md overflow-hidden flex flex-col group">
                <img src="${book.coverImageUrl || 'https://placehold.co/400x600/e2e8f0/4a5568?text=No+Cover'}" alt="${book.title || 'Book'}" class="h-56 w-full object-cover">
                <div class="p-4 flex flex-col flex-grow justify-between">
                    <div>
                        <h4 class="font-bold truncate group-hover:text-blue-600">${book.title}</h4>
                        <p class="text-sm text-gray-500">${book.author || 'Unknown Author'}</p>
                    </div>
                    <button onclick="showPdfPreviewModal(null, '${(book.title || '').replace(/'/g, "\\'")}')" class="mt-4 text-blue-600 font-semibold text-sm text-left self-start">Read Now →</button>
                </div>
            </div>`;
        });
    }
    container.innerHTML = html;
     lucide.createIcons();

     const paginationContainer = document.getElementById('books-pagination');
     if (paginationContainer) {
        renderPagination(totalPages, 'books-pagination', (page) => { 
             currentBookPage = page; 
             renderFilteredBooks(); 
             const listTop = container.offsetTop;
             const headerHeight = header ? header.offsetHeight : 80;
             window.scrollTo({top: listTop - headerHeight - 20, behavior: 'smooth'}); 
        });
     }
}

function loadScholarshipsData() {
    const container = document.getElementById('scholarships-list');
    if (!container) return;

    // Static data as before
    const scholarships = [
        { title: "Somaliland Future Leaders Scholarship", provider: "Ministry of Education", deadline: "Dec 15, 2025", field: "STEM" },
        { title: "Hargeisa Tech Innovators Grant", provider: "HiigsiTech Foundation", deadline: "Jan 30, 2026", field: "Computer Science" },
        { title: "Red Sea Maritime Studies Bursary", provider: "Berbera Port Authority", deadline: "Feb 10, 2026", field: "Maritime Engineering" },
        { title: "Gabiley Agri-Business Scholarship", provider: "Somaliland Agri-Fund", deadline: "Feb 28, 2026", field: "Agriculture" },
        { title: "National Health Professionals Fund", provider: "Ministry of Health", deadline: "Mar 05, 2026", field: "Medicine" },
    ];

    container.innerHTML = scholarships.map(s => `
        <div class="bg-gray-50 border rounded-lg p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <span class="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-2">${s.field}</span>
                <h3 class="text-xl font-bold">${s.title}</h3>
                <p class="text-gray-600 mt-1">Provided by: <span class="font-semibold">${s.provider}</span></p>
                <p class="text-red-600 text-sm mt-1">Deadline: ${s.deadline}</p>
            </div>
            <a href="#" class="gradient-bg text-white font-semibold px-5 py-2 rounded-lg mt-4 sm:mt-0 flex-shrink-0">Learn More</a>
        </div>
    `).join('');
     lucide.createIcons();
}

// --- Blog List Page (blog.html) ---
async function loadBlogList() {
    const container = document.getElementById('blog-list-container');
    if (!container) return;
    container.innerHTML = createPlaceholder(6, 'book'); // Use book placeholder styling

    try {
        const q = query(collection(db, "blogs"), where("status", "==", "published"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allBlogPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (allBlogPosts.length === 0) {
            container.innerHTML = '<p class="col-span-full text-center text-gray-500">No blog posts found.</p>';
            return;
        }

        container.innerHTML = allBlogPosts.map(post => {
            const excerpt = post.content ? stripHtml(post.content).substring(0, 150) + '...' : 'No content available.';
            const postUrl = `post.html?slug=${post.slug || post.id}`; // Use slug if available, else ID
            return `
            <div class="bg-white rounded-lg shadow-md overflow-hidden flex flex-col group">
                <a href="${postUrl}">
                   <img src="${post.imageUrl || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=870&auto=format=fit=crop'}" alt="${post.title}" class="h-56 w-full object-cover">
                </a>
                <div class="p-6 flex flex-col flex-grow">
                    <h4 class="text-xl font-bold group-hover:text-blue-600 transition-colors"><a href="${postUrl}">${post.title}</a></h4>
                    <p class="text-sm text-gray-500 mt-1">By ${post.authorName || 'ArdayCaawiye Team'} • ${post.createdAt ? post.createdAt.toDate().toLocaleDateString() : ''}</p>
                    <p class="text-gray-600 mt-3 flex-grow">${excerpt}</p>
                    <a href="${postUrl}" class="mt-4 text-blue-600 font-semibold text-left self-start">Read Full Post →</a>
                </div>
            </div>
        `}).join('');
        lucide.createIcons();
    } catch (error) {
        console.error("Error loading blog posts:", error);
        container.innerHTML = '<p class="col-span-full text-center text-red-500">Error loading blog posts.</p>';
    }
}

// --- Single Post Page (post.html) ---
function getCurrentPostIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug') || params.get('id'); // Prefer slug, fallback to id
}

async function loadSinglePost(postIdOrSlug) {
    const container = document.getElementById('post-content-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-500">Loading post details...</p>';

    try {
        let postDoc;
        // Try fetching by slug first
        let q = query(collection(db, "blogs"), where("slug", "==", postIdOrSlug), limit(1));
        let querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // If not found by slug, try fetching by ID (fallback)
            console.log("Post not found by slug, trying ID:", postIdOrSlug);
            const docRef = doc(db, "blogs", postIdOrSlug);
            const docSnap = await getDoc(docRef);
             if (docSnap.exists()) {
                 postDoc = { id: docSnap.id, ...docSnap.data() };
             }
        } else {
             const docSnap = querySnapshot.docs[0];
             postDoc = { id: docSnap.id, ...docSnap.data() };
        }


        if (postDoc && postDoc.status === 'published') {
            document.title = `${postDoc.title} - ArdayCaawiye Blog`; // Update page title

            container.innerHTML = `
                <img src="${postDoc.imageUrl || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=870&auto=format=fit=crop'}" alt="${postDoc.title}" class="w-full h-64 md:h-80 object-cover rounded-lg mb-6">
                <h1 class="text-3xl md:text-4xl font-extrabold text-gray-900">${postDoc.title}</h1>
                <p class="text-md text-gray-500 mt-2 mb-6">By ${postDoc.authorName || 'ArdayCaawiye Team'} • ${postDoc.createdAt ? postDoc.createdAt.toDate().toLocaleDateString() : ''}</p>
                <div class="prose lg:prose-xl max-w-none text-gray-700">${postDoc.content}</div>
            `;
            
            // Add share buttons
            addShareButtons(postDoc.title, window.location.href);

            // Load comments for this post ID
            loadComments(postDoc.id);

             // Render comment form (will show login prompt if needed)
             renderCommentForm(postDoc.id, currentUser);

        } else {
            container.innerHTML = '<h1 class="text-3xl font-bold text-red-600">Post Not Found</h1><p>The requested blog post could not be found or is not published.</p>';
        }
    } catch (error) {
        console.error("Error loading single post:", error);
        container.innerHTML = '<h1 class="text-3xl font-bold text-red-600">Error</h1><p>Could not load the blog post.</p>';
    }
     lucide.createIcons();
}

function addShareButtons(title, url) {
    const container = document.getElementById('share-container');
    if (!container) return;

    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    container.innerHTML = `
        <p class="font-semibold mb-2">Share this post:</p>
        <div class="share-buttons">
            <a href="https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}" target="_blank" class="share-button share-whatsapp">
                <i data-lucide="message-circle"></i> WhatsApp
            </a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" class="share-button share-facebook">
                <i data-lucide="facebook"></i> Facebook
            </a>
            <button id="copy-link-btn" class="share-button share-copy">
                <i data-lucide="link"></i> Copy Link
            </button>
        </div>
    `;
    lucide.createIcons();

    // Add copy link functionality
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(url).then(() => {
                alert("Link copied to clipboard!");
            }).catch(err => {
                console.error('Failed to copy: ', err);
                 alert("Failed to copy link.");
            });
        });
    }
}

// --- Comment Loading and Submission (for post.html) ---
function renderCommentForm(postId, user) {
    const container = document.getElementById('comment-form-container');
    if (!container) return;
    container.dataset.postId = postId; // Store postId for submission
    
    if (user) {
        container.innerHTML = `
            <form id="comment-form" class="comment-form">
                <h4 class="text-xl font-bold mb-4">Leave a Comment</h4>
                <textarea id="comment-text" class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" rows="4" placeholder="Write your comment..." required></textarea>
                <button type="submit" class="mt-4 gradient-bg text-white font-bold py-2 px-6 rounded-lg hover:opacity-90">Post Comment</button>
            </form>
        `;
        // Remove previous listener if exists to prevent duplicates
        const oldForm = document.getElementById('comment-form');
         if(oldForm) {
            oldForm.replaceWith(oldForm.cloneNode(true)); // Clone to remove listeners
         }
         // Add new listener
         document.getElementById('comment-form')?.addEventListener('submit', handleCommentSubmit);

    } else {
        container.innerHTML = `
            <p class="text-gray-600">Please <a href="login.html" class="text-blue-600 font-semibold hover:underline">log in</a> to leave a comment.</p>
        `;
    }
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const container = document.getElementById('comment-form-container');
    const postId = container ? container.dataset.postId : null;
    const commentTextEl = document.getElementById('comment-text');
    const commentText = commentTextEl ? commentTextEl.value : null;
    const user = auth.currentUser;

    if (!postId || !commentText || !user) {
        alert("Could not post comment. Ensure you are logged in and the field is not empty.");
        return;
    }
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Posting...";
    }

    try {
        const commentsRef = collection(db, "blogs", postId, "comments");
        await addDoc(commentsRef, {
            text: commentText,
            authorId: user.uid,
            authorName: user.displayName || "Anonymous", // Use display name from auth profile
            createdAt: serverTimestamp()
        });
        if (commentTextEl) commentTextEl.value = ''; // Clear textarea
        // Firestore listener (loadComments) will automatically update the list
    } catch (error) {
        console.error("Error posting comment:", error);
        alert("Error posting comment.");
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Post Comment";
        }
    }
}

function loadComments(postId) {
    const container = document.getElementById('comment-list-container');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500">Loading comments...</p>';

    // Stop any previous listener
    if (commentsUnsubscribe) {
        console.log("Unsubscribing from previous comments listener.");
        commentsUnsubscribe();
        commentsUnsubscribe = null;
    }

    const commentsRef = query(collection(db, "blogs", postId, "comments"), orderBy("createdAt", "desc"));
    
    console.log("Setting up new comments listener for post:", postId);
    commentsUnsubscribe = onSnapshot(commentsRef, (snapshot) => {
         console.log(`Received ${snapshot.docs.length} comments.`);
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">No comments yet. Be the first!</p>';
            return;
        }
        
        container.innerHTML = snapshot.docs.map(doc => {
            const comment = doc.data();
            const dateString = comment.createdAt ? comment.createdAt.toDate().toLocaleString() : 'Just now';
            // Basic sanitization: replace < and > to prevent HTML injection
            const sanitizedText = (comment.text || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const sanitizedName = (comment.authorName || 'Anonymous').replace(/</g, "&lt;").replace(/>/g, "&gt;");

            return `
                <div class="comment">
                    <p class="comment-author">${sanitizedName}</p>
                    <p class="comment-date">${dateString}</p>
                    <p class="comment-body">${sanitizedText.replace(/\n/g, '<br>')}</p> 
                </div>
            `;
        }).join('');
    }, (error) => {
         console.error("Error fetching comments:", error);
         container.innerHTML = '<p class="text-red-500">Error loading comments.</p>';
    });
}


// =========================================================================
// Utility Functions
// =========================================================================

function createPlaceholder(count, type) {
    let classes = 'bg-gray-200 rounded-lg animate-pulse ';
    if (type === 'exam') classes += 'h-32';
    else if (type === 'book') classes += 'h-80';
    else classes += 'h-48'; // Default placeholder height
    return Array(count).fill().map(() => `<div class="${classes}"></div>`).join('');
}

function getSubjectIconUrl(subject) {
    const s_lower = (subject || 'general').toLowerCase();
    // Simplified keyword matching
    const keywords = ['physics', 'chemistry', 'biology', 'math', 'islamic', 'arabic', 'somali', 'english', 'history', 'geography'];
    const keyword = keywords.find(k => s_lower.includes(k)) || 'education'; // Default
    // Use a placeholder service for reliability
    // return `https://source.unsplash.com/random/200x240/?${keyword}`; // Unsplash can be unreliable
    return `https://placehold.co/200x240/e2e8f0/4a5568?text=${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`;
}

function renderPagination(totalPages, containerId, pageChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentPage = containerId === 'exams-pagination' ? currentExamPage : currentBookPage;

    if (totalPages <= 1) {
        container.innerHTML = ''; return;
    }
    
    let html = `<button data-page="prev" class="pagination-btn">< Prev</button>`;
    
    const pages = [];
    const maxPagesToShow = 5; // How many page numbers max (excluding ellipsis)
    if (totalPages <= maxPagesToShow + 2) { // Show all if not many pages
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1); // Always show first page
        let startPage, endPage;
        if (currentPage <= Math.ceil(maxPagesToShow / 2)) {
             startPage = 2;
             endPage = maxPagesToShow;
             if (endPage < totalPages -1) pages.push('...');
        } else if (currentPage >= totalPages - Math.floor(maxPagesToShow / 2)) {
             startPage = totalPages - maxPagesToShow + 1;
             endPage = totalPages - 1;
              pages.push('...');
        } else {
            startPage = currentPage - Math.floor((maxPagesToShow - 2) / 2);
            endPage = currentPage + Math.ceil((maxPagesToShow - 2) / 2);
             pages.push('...');
             if (endPage < totalPages -1) pages.push('...'); // Ellipsis after if needed
        }
        
        for (let i = startPage; i <= endPage; i++) {
             pages.push(i);
        }
        
        pages.push(totalPages); // Always show last page
    }

    const uniquePages = [...new Set(pages)]; // Ensure no duplicates if logic overlaps slightly
    uniquePages.forEach(p => {
        if (p === '...') {
            html += `<span class="px-2 py-2 hidden md:inline">...</span>`;
        } else {
            html += `<button data-page="${p}" class="pagination-btn ${p === currentPage ? 'active' : ''}">${p}</button>`;
        }
    });

    html += `<button data-page="next" class="pagination-btn">Next ></button>`;
    container.innerHTML = html;

    // Add listeners after rendering
    container.querySelectorAll('.pagination-btn').forEach(btn => {
        const page = btn.dataset.page;
        if (page === 'prev') {
            btn.disabled = currentPage === 1;
            btn.addEventListener('click', () => pageChangeCallback(currentPage - 1));
        } else if (page === 'next') {
            btn.disabled = currentPage === totalPages;
            btn.addEventListener('click', () => pageChangeCallback(currentPage + 1));
        } else {
            // Check if it's a number before adding listener
            if (!isNaN(parseInt(page))) {
                 btn.addEventListener('click', () => pageChangeCallback(parseInt(page)));
            }
        }
    });
}

function stripHtml(html) {
   let tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return tmp.textContent || tmp.innerText || "";
}

// --- Modal Controls ---
window.showPdfPreviewModal = function(url, title) { // Make it globally accessible
    const titleEl = document.getElementById('pdf-title');
    if (titleEl) titleEl.textContent = title || "Access Full Document";
    if (pdfModal) pdfModal.style.display = 'flex';
}
if(closeModalBtn) closeModalBtn.onclick = () => { if(pdfModal) pdfModal.style.display = 'none'; };

function showComingSoonPopup(e) {
    if (e) e.preventDefault(); // Prevent navigation if called from link
    if (comingSoonModal) comingSoonModal.style.display = 'flex';
}
function hideComingSoonPopup() {
    if (comingSoonModal) comingSoonModal.style.display = 'none';
}
if(closeComingSoonBtn) closeComingSoonBtn.addEventListener('click', hideComingSoonPopup);
if(comingSoonOkBtn) comingSoonOkBtn.addEventListener('click', hideComingSoonPopup);

// --- Auth Form Logic (for login.html) ---
// Note: Assumes login.html includes an element with id="auth-container-login"
function renderAuthForm(isLogin = true) {
     // Only render if on the login page and the container exists
     const authContainer = document.getElementById('auth-container-login'); // Use specific ID for login page
     if (!authContainer || currentPage !== 'login.html') return;

    authContainer.innerHTML = `
        <h2 class="text-2xl font-bold text-center mb-1">${isLogin ? 'Welcome Back!' : 'Create Account'}</h2>
        <p class="text-gray-500 text-center mb-6">${isLogin ? 'Log in to continue.' : 'Sign up to get started.'}</p>
        <form id="auth-form" class="space-y-4">
            ${!isLogin ? '<input type="text" id="username" placeholder="Full Name" required class="w-full p-3 border rounded-lg">' : ''}
            <input type="email" id="email" placeholder="Email" required class="w-full p-3 border rounded-lg">
            <input type="password" id="password" placeholder="Password (min. 6 characters)" required class="w-full p-3 border rounded-lg">
            <div id="auth-error" class="text-red-500 text-sm"></div>
            <button type="submit" class="w-full gradient-bg text-white font-bold py-3 rounded-lg">${isLogin ? 'Log In' : 'Sign Up'}</button>
        </form>
        <p class="text-center text-sm mt-4">
            ${isLogin ? "Don't have an account?" : "Already have an account?"} 
            <button id="auth-toggle" class="font-semibold text-blue-600 hover:underline">${isLogin ? 'Sign Up' : 'Log In'}</button>
        </p>`;
    
    // Attach listeners after rendering
    const authForm = document.getElementById('auth-form');
    const authToggle = document.getElementById('auth-toggle');

    if (authToggle) authToggle.addEventListener('click', () => renderAuthForm(!isLogin));
    if (authForm) authForm.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        const isLoginForm = !document.getElementById('username'); // Check if username field exists
        isLoginForm ? handleLogin() : handleSignup(); 
    });
}

function handleLogin() {
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const errorEl = document.getElementById('auth-error');
    if (!emailEl || !passwordEl || !errorEl) return; // Elements not found

    const email = emailEl.value;
    const password = passwordEl.value;
    errorEl.textContent = ''; // Clear previous errors

    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
             // Redirect handled by onAuthStateChanged
             console.log("Login successful, redirecting...");
        })
        .catch(err => {
             errorEl.textContent = err.message; // Show login error
        });
}

function handleSignup() {
     const usernameEl = document.getElementById('username');
     const emailEl = document.getElementById('email');
     const passwordEl = document.getElementById('password');
     const errorEl = document.getElementById('auth-error');
     if (!usernameEl || !emailEl || !passwordEl || !errorEl) return;

    const username = usernameEl.value;
    const email = emailEl.value;
    const password = passwordEl.value;
    errorEl.textContent = '';

    createUserWithEmailAndPassword(auth, email, password).then(cred => {
        // Set user document in Firestore
        const userDocRef = doc(db, "users", cred.user.uid);
        return setDoc(userDocRef, { 
            displayName: username, 
            email: email, 
            role: 'user', // Default role
            isPremium: false, 
            banned: false, // Default banned status
            createdAt: serverTimestamp(),
            uid: cred.user.uid 
        })
        .then(() => {
            // Update auth profile display name
            return updateProfile(cred.user, { displayName: username });
        })
        .then(() => {
             // Redirect handled by onAuthStateChanged
             console.log("Signup successful, redirecting...");
        });
    }).catch(err => {
         errorEl.textContent = err.message; // Show signup error
    });
}

// --- Contact Form ---
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameEl = document.getElementById('contact-name');
        const emailEl = document.getElementById('contact-email');
        const messageEl = document.getElementById('contact-message');
        const successMsg = document.getElementById('contact-success');
        const submitBtn = contactForm.querySelector('button[type="submit"]');

        if (!nameEl || !emailEl || !messageEl || !successMsg || !submitBtn) return;

        const name = nameEl.value;
        const email = emailEl.value;
        const message = messageEl.value;
        
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";

        try {
            await addDoc(collection(db, "contact"), {
                name, email, message, sentAt: serverTimestamp(), read: false // Add 'read' status
            });
            contactForm.reset();
            successMsg.classList.remove('hidden');
            setTimeout(() => successMsg.classList.add('hidden'), 4000);
        } catch (error) {
            console.error("Error sending contact message: ", error);
            alert('There was an error sending your message. Please try again.');
        } finally {
             submitBtn.disabled = false;
             submitBtn.textContent = "Send Message";
        }
    });
}

// --- Animations & Other Effects ---
function initializeAnimations() {
    // Reveal on scroll
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // Stat counter animation
    const numberFormatter = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
        return num.toString();
    }
    const statsObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target.querySelector('h3[data-target]');
                if (!counter || counter.dataset.animated) return;
                
                counter.dataset.animated = "true";
                const target = +counter.dataset.target;
                const isPercent = counter.textContent.includes('%');
                let current = 0;
                const duration = 1500; // ms
                const stepTime = 16; // approx 60fps
                const steps = duration / stepTime;
                const increment = target / steps;

                const timer = setInterval(() => {
                    current += increment;
                    if (current >= target) {
                        clearInterval(timer);
                        counter.textContent = numberFormatter(target) + (isPercent ? '%' : '');
                    } else {
                        counter.textContent = numberFormatter(Math.ceil(current));
                    }
                }, stepTime);
                observer.unobserve(entry.target); // Animate only once
            }
        });
    }, { threshold: 0.8 });
    document.querySelectorAll('.stat-card').forEach(card => statsObserver.observe(card));
}

function setupCarousel() {
    const track = document.getElementById('carousel-track');
    const container = document.getElementById('carousel-track-container');
    if (!track || !container || track.children.length === 0 || track.dataset.initialized) return;
    
    track.dataset.initialized = "true"; // Prevent re-initialization

    const slides = Array.from(track.children);
    const originalSlideCount = slides.length;
    
    let slideWidth, slidesInView;

    function calculateCarouselLayout() {
        slideWidth = container.clientWidth; 
        slidesInView = window.innerWidth < 768 ? 1 : (window.innerWidth < 1024 ? 2 : 3);
        const itemWidth = slideWidth / slidesInView;

        // Apply width to original and cloned slides
        Array.from(track.children).forEach(slide => {
             slide.style.width = `${itemWidth}px`;
             slide.style.flexShrink = '0'; // Ensure slides don't shrink
        });
        
        // Reset transform immediately after width change
        track.style.transition = 'none';
        track.style.transform = `translateX(-${currentIndex * itemWidth}px)`;
    }
    
    // Clone only if needed for looping
    if (originalSlideCount > slidesInView) {
         for (let i = 0; i < originalSlideCount; i++) {
             track.appendChild(slides[i].cloneNode(true));
         }
    } else {
         // Not enough slides to clone or loop, just set widths
         calculateCarouselLayout();
         return; // No interval needed
    }
    
    let currentIndex = 0;
    let intervalId = null;

    function startCarouselInterval() {
         if (intervalId) clearInterval(intervalId); // Clear existing interval

         calculateCarouselLayout(); // Calculate layout on start/restart

         intervalId = setInterval(() => {
             currentIndex++;
             track.style.transition = 'transform 0.5s ease-in-out';
             const currentItemWidth = track.children[0].getBoundingClientRect().width; // Get current width
             track.style.transform = `translateX(-${currentIndex * currentItemWidth}px)`;

             // Use a separate listener for transition end to reset
             const resetTransition = () => {
                 if (currentIndex >= originalSlideCount) {
                     track.style.transition = 'none';
                     currentIndex = 0;
                     track.style.transform = `translateX(0)`;
                 }
                 track.removeEventListener('transitionend', resetTransition); // Clean up listener
             };
             track.addEventListener('transitionend', resetTransition);

         }, 5000); // Change slide every 5 seconds
    }

    // Debounced resize handler
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
             console.log("Resizing carousel...");
             if (originalSlideCount > slidesInView) { // Only restart if looping
                 startCarouselInterval(); // Recalculate widths and restart interval
             } else {
                 calculateCarouselLayout(); // Just recalculate widths if not looping
             }
        }, 250); // Debounce time
    });

    startCarouselInterval(); // Initial start
}

// --- General Event Listeners ---
if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => mobileMenu?.classList.toggle('hidden'));

// Close mobile menu when a link inside it is clicked
if(mobileMenu) {
     mobileMenu.addEventListener('click', (e) => {
         if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') {
             mobileMenu.classList.add('hidden');
         }
     });
}

// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    loadSiteSettings(); // Load dynamic links immediately
    initializeAnimations(); // Set up scroll/counter animations
    lucide.createIcons(); // Initial icon rendering

    // Page specific initializations are handled within the currentPage checks
});
