// Add these helper functions at the top of your script
console.log('=== TIMESHEET SCRIPT LOADED - VERSION WITH FIX ===');

function saveTimesheetDraft() {
  const draftData = {
      startDate: timesheetStartInput.value,
      entries: {}
  };

  const rows = timesheetFormDiv.querySelectorAll('.timesheet-row');
  rows.forEach(row => {
      const date = row.getAttribute('data-date');
      draftData.entries[date] = {
          start1: row.querySelector('input[name="start1"]').value, // Changed from start1
          end1: row.querySelector('input[name="end1"]').value,    // Changed from end1
          start2: row.querySelector('input[name="start2"]').value, // Changed from start2
          end2: row.querySelector('input[name="end2"]').value,     // Changed from end2
          job: row.querySelector('select[name="jobDescription"]').value,
          comment: row.querySelector('input[name="comment"]').value,
          // NEW: keep any sessions attached to the row
          onCallSessions: row.onCallSessions || []
      };
  });

  localStorage.setItem('timesheetDraft', JSON.stringify(draftData));
}

  async function loadTimesheetDraft() {
  const draft = JSON.parse(localStorage.getItem('timesheetDraft'));
  if (!draft) return;

  // Set start date and render form
  timesheetStartInput.value = draft.startDate;
  timesheetStartSection.classList.remove('hidden');
  timesheetEntryContainer.classList.remove('hidden');
  
  // Wait for form rendering to complete
  await renderTimesheetForm(draft.entries); // Pass draft data directly
}
  
  
  /********************************************************
   * Pay period logic with a year-based reset.
   ********************************************************/
  function getPayPeriodStartForToday() {
    const now = new Date();
    let year = now.getFullYear();
    // Base for this year's Jan 6 in UTC
    let baseUTC = Date.UTC(year, 0, 6); 
    
    const todayUTC = Date.UTC(
      now.getUTCFullYear(), 
      now.getUTCMonth(), 
      now.getUTCDate()
    );
    
    // If "today" is before this year's Jan 6, back up to last year's
    if (todayUTC < baseUTC) {
      year--;
      baseUTC = Date.UTC(year, 0, 6);
    }
    
    let currentStart = baseUTC;
    while (true) {
      const nextPeriod = currentStart + (14 * 24 * 60 * 60 * 1000);
      if (nextPeriod <= todayUTC) {
        currentStart = nextPeriod;
      } else {
        break;
      }
    }
    return new Date(currentStart);
  }

  /**
   * Check if a date is a valid pay period start date
   * Valid dates are: Jan 6 + multiples of 14 days within the same year
   */
  function isValidPayPeriodStartDate(date) {
    if (!date) return false;
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    
    const year = d.getFullYear();
    const baseDate = new Date(Date.UTC(year, 0, 6));
    const baseUTC = baseDate.getTime();
    const dateUTC = Date.UTC(year, d.getMonth(), d.getDate());
    
    // Check if date is before the base date for this year
    if (dateUTC < baseUTC) {
      // Check previous year
      const prevYearBase = Date.UTC(year - 1, 0, 6);
      const daysDiff = (dateUTC - prevYearBase) / (24 * 60 * 60 * 1000);
      return daysDiff >= 0 && daysDiff % 14 === 0;
    }
    
    // Check if date is exactly on a pay period start (multiple of 14 days from Jan 6)
    const daysDiff = (dateUTC - baseUTC) / (24 * 60 * 60 * 1000);
    return daysDiff >= 0 && daysDiff % 14 === 0;
  }

  /**
   * Find the nearest valid pay period start date (rounds to the nearest valid date)
   */
  function findNearestValidPayPeriodStart(date) {
    if (!date) return getPayPeriodStartForToday();
    const d = new Date(date);
    if (isNaN(d.getTime())) return getPayPeriodStartForToday();
    
    const year = d.getFullYear();
    const baseDate = new Date(Date.UTC(year, 0, 6));
    const baseUTC = baseDate.getTime();
    const dateUTC = Date.UTC(year, d.getMonth(), d.getDate());
    
    // Calculate days from base
    let daysDiff = Math.round((dateUTC - baseUTC) / (24 * 60 * 60 * 1000));
    
    // If negative, check previous year
    if (daysDiff < 0) {
      const prevYearBase = Date.UTC(year - 1, 0, 6);
      daysDiff = Math.round((dateUTC - prevYearBase) / (24 * 60 * 60 * 1000));
      if (daysDiff < 0) {
        return getPayPeriodStartForToday();
      }
      // Round to nearest multiple of 14
      const nearestPeriod = Math.round(daysDiff / 14) * 14;
      const resultDate = new Date(prevYearBase + nearestPeriod * 24 * 60 * 60 * 1000);
      return resultDate;
    }
    
    // Round to nearest multiple of 14
    const nearestPeriod = Math.round(daysDiff / 14) * 14;
    const resultDate = new Date(baseUTC + nearestPeriod * 24 * 60 * 60 * 1000);
    
    // If result is in the future beyond reasonable range, use today's pay period
    const today = new Date();
    if (resultDate > today && resultDate.getTime() - today.getTime() > 14 * 24 * 60 * 60 * 1000) {
      return getPayPeriodStartForToday();
    }
    
    return resultDate;
  }
  
  /** If " "/"NaN", style them so they're effectively invisible. */
  function styleNone(val) {
    if(!val || val===" " || val==="NaN"){
      return ' style="color:#f9fcff;"';
    }
    return '';
  }
  
  /** Convert "HH:MM" => "hh:mm AM/PM" for display */
  function formatTime24ToAmPm(ts) {
    if(!ts) return "";
    const [hStr, mStr] = ts.split(':');
    let hh = parseInt(hStr, 10);
    const mm = parseInt(mStr, 10);
    if(isNaN(hh) || isNaN(mm)) return "";
    let ampm = "AM";
    if (hh >= 12) ampm = "PM";
    if (hh > 12) hh -= 12;
    if (hh === 0) hh = 12;
    return hh.toString().padStart(2, '0') + ":" + mm.toString().padStart(2, '0') + " " + ampm;
  }
  
  /** Convert "hh:mm AM/PM" => "HH:MM" */
  function parseAmPmTo24Hr(st) {
    if(!st || !/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(st.trim())){
      return "";
    }
    const parts = st.trim().split(/\s+/);
    const [hhStr, mmStr] = parts[0].split(':');
    let hour = parseInt(hhStr, 10);
    const minute = parseInt(mmStr, 10);
    const ampm = parts[1].toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return hour.toString().padStart(2, '0') + ":" + minute.toString().padStart(2, '0');
  }
  
  /** parseLocalDate("YYYY-MM-DD") => Date */
  function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  
  /** compute hours from "HH:MM" start/end */
  function calculateHours(st, et) {
    console.log('[calculateHours] Called with:', { st, et, stType: typeof st, etType: typeof et });
    if (!st || st===" " || !et || et===" ") {
      console.log('[calculateHours] Returning 0 - missing start or end');
      return 0;
    }
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    console.log('[calculateHours] Parsed times:', { sh, sm, eh, em });
    const sTot = sh * 60 + sm;
    const eTot = eh * 60 + em;
    console.log('[calculateHours] Total minutes:', { sTot, eTot });
    if (eTot <= sTot) {
      console.log('[calculateHours] Returning 0 - end <= start');
      return 0;
    }
    const hours = (eTot - sTot) / 60;
    console.log('[calculateHours] Returning hours:', hours);
    return hours;
  }

  /** compute total hours intelligently handling edge cases */
  function calculateTotalHours(start1, end1, start2, end2) {
    console.log('[calculateTotalHours] ===== START =====');
    console.log('[calculateTotalHours] Raw inputs:', { 
      start1, end1, start2, end2,
      start1Type: typeof start1, end1Type: typeof end1,
      start2Type: typeof start2, end2Type: typeof end2
    });
    
    // Normalize: handle null, undefined, empty strings, and " " (space)
    const normalize = (val) => {
      if (val == null || val === undefined) {
        console.log('[normalize] Value is null/undefined:', val);
        return "";
      }
      const str = String(val);
      const trimmed = str.trim();
      // Return empty string if value is empty, just a space, or "NaN"
      if (trimmed === "" || trimmed === " " || trimmed === "NaN" || trimmed.toLowerCase() === "none") {
        console.log('[normalize] Value is empty/space/NaN/none:', { original: val, str, trimmed });
        return "";
      }
      console.log('[normalize] Value normalized:', { original: val, str, trimmed, result: trimmed });
      return trimmed;
    };
    
    const st1 = normalize(start1);
    const et1 = normalize(end1);
    const st2 = normalize(start2);
    const et2 = normalize(end2);
    
    console.log('[calculateTotalHours] After normalization:', { st1, et1, st2, et2 });
    console.log('[calculateTotalHours] Boolean checks:', { 
      st1Bool: !!st1, et1Bool: !!et1, st2Bool: !!st2, et2Bool: !!et2,
      notEt1: !et1, notSt2: !st2
    });

    // Special case: start1 filled, end1 blank, start2 blank, end2 filled
    // Calculate from start1 to end2 (treating it as one continuous period)
    const isSpecialCase = st1 && !et1 && !st2 && et2;
    console.log('[calculateTotalHours] Special case check:', {
      condition: 'st1 && !et1 && !st2 && et2',
      st1: !!st1,
      notEt1: !et1,
      notSt2: !st2,
      et2: !!et2,
      result: isSpecialCase
    });
    
    if (isSpecialCase) {
      console.log('[calculateTotalHours] SPECIAL CASE DETECTED - calculating from start1 to end2');
      const hours = calculateHours(st1, et2);
      console.log('[calculateTotalHours] Special case result:', hours);
      console.log('[calculateTotalHours] ===== END (special case) =====');
      return hours;
    }

    // Normal case: calculate both periods if they have both start and end
    console.log('[calculateTotalHours] NORMAL CASE - calculating both periods');
    let total = 0;
    if (st1 && et1) {
      console.log('[calculateTotalHours] Calculating period 1:', { st1, et1 });
      const period1 = calculateHours(st1, et1);
      console.log('[calculateTotalHours] Period 1 hours:', period1);
      total += period1;
    } else {
      console.log('[calculateTotalHours] Skipping period 1 - missing start or end');
    }
    if (st2 && et2) {
      console.log('[calculateTotalHours] Calculating period 2:', { st2, et2 });
      const period2 = calculateHours(st2, et2);
      console.log('[calculateTotalHours] Period 2 hours:', period2);
      total += period2;
    } else {
      console.log('[calculateTotalHours] Skipping period 2 - missing start or end');
    }
    console.log('[calculateTotalHours] Total hours:', total);
    console.log('[calculateTotalHours] ===== END (normal case) =====');
    return total;
  }
  
  import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
  import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
  } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
  import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    addDoc,
    query,
    where,
    serverTimestamp,
    updateDoc,
    deleteField
  } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
  
  const firebaseConfig = {
    apiKey: "AIzaSyBSidlO3C_GXOa7Iw1MFyVI35MzrQEJqyk",
    authDomain: "alcotimesheet-7df9a.firebaseapp.com",
    projectId: "alcotimesheet-7df9a",
    storageBucket: "alcotimesheet-7df9a.appspot.com",
    messagingSenderId: "898498713259",
    appId: "1:898498713259:web:6e7b578697d44c89f009ee",
    measurementId: "G-97VCE2E8Z2"
  };
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  // DOM references
  const userAuthSection   = document.getElementById('user-auth-section');
  const userSignupSection = document.getElementById('user-signup-section');
  const adminLoginSection = document.getElementById('admin-login-section');
  const authContainer     = document.getElementById('auth-container');
  const userDashboard     = document.getElementById('user-dashboard');
  const adminDashboard    = document.getElementById('admin-dashboard');
  
  const loginEmailInput   = document.getElementById('login-email');
  const loginPasswordInput = document.getElementById('login-password');
  const loginBtn          = document.getElementById('login-btn');
  
  const signupFirstNameInput = document.getElementById('signup-firstname');
  const signupLastNameInput  = document.getElementById('signup-lastname');
  const signupEmailInput     = document.getElementById('signup-email');
  const signupPasswordInput  = document.getElementById('signup-password');
  const signupBtn            = document.getElementById('signup-btn');
  
  const adminPasswordInput  = document.getElementById('admin-password');
  const adminLoginBtn       = document.getElementById('admin-login-btn');
  const adminAccessLink     = document.getElementById('admin-access-link');
  
  const goToSignupLink      = document.getElementById('go-to-signup');
  const goToLoginLink       = document.getElementById('go-to-login');
  const goToUserLoginLink   = document.getElementById('go-to-user-login');
  
  /* Forgot Password link */
  const forgotPasswordLink  = document.getElementById('forgot-password-link');
  
  const logoutBtn           = document.getElementById('logout-btn');
  const adminLogoutBtn      = document.getElementById('admin-logout-btn');
  const gearButton          = document.getElementById('gear-button');
  
  const userNameDisplay     = document.getElementById('user-name-display');
  const timesheetStartInput = document.getElementById('timesheet-start');
  const timesheetFormDiv    = document.getElementById('timesheet-form');
  const easyFillBtn         = document.getElementById('easy-fill-btn');
  const exportTimesheetBtn  = document.getElementById('export-timesheet-btn');
  const submitTimesheetBtn  = document.getElementById('submit-timesheet-btn');
  const cancelTimesheetBtn  = document.getElementById('cancel-timesheet-btn');
  
  const createNewTimesheetBtn      = document.getElementById('create-new-timesheet-btn');
  const createNewTimesheetContainer = document.getElementById('create-new-timesheet-container');
  const timesheetStartSection       = document.getElementById('timesheet-start-section');
  const timesheetEntryContainer     = document.getElementById('timesheet-entry-container');
  const pastTimesheetsDiv           = document.getElementById('past-timesheets');
  
  const adminUsersWrapper           = document.getElementById('admin-users-wrapper');
  const adminApprovedWrapper        = document.getElementById('admin-approved-wrapper');
  const adminPendingViewContainer   = document.getElementById('admin-pending-view-container');
  const adminApprovedViewContainer  = document.getElementById('admin-approved-view-container');
  
  const easyfillSettingsContainer   = document.getElementById('easyfill-settings-container');
  const easyfillSettingsTbody       = document.getElementById('easyfill-settings-tbody');
  const easyfillEditBtn             = document.getElementById('easyfill-edit-btn');
  const easyfillBackBtn             = document.getElementById('easyfill-back-btn');
  
  /* Custom Jobs module */
  const customJobsContainer = document.getElementById('custom-jobs-container');
  const customJobInput      = document.getElementById('custom-job-input');
  const addCustomJobBtn     = document.getElementById('add-custom-job-btn');
  const customJobsList      = document.getElementById('custom-jobs-list');
  
  let currentUser = null;
  let isAdmin = false;
  let currentUserName = "";
  let userEasyFillSettings = {};
  let userCustomJobs = []; // Array of user-defined jobs
  
  // Replace these with your own admin credentials as needed:
  const adminEmail = "admin@mydomain.com";
  const adminRealPassword = "alco1234";
  
  /*************************
   * Page Navigation / UI
   *************************/
  function showUserLogin() {
    userAuthSection.classList.remove('hidden');
    userSignupSection.classList.add('hidden');
    adminLoginSection.classList.add('hidden');
    userDashboard.classList.add('hidden');
    adminDashboard.classList.add('hidden');
  }
  function showUserSignup() {
    userAuthSection.classList.add('hidden');
    userSignupSection.classList.remove('hidden');
    adminLoginSection.classList.add('hidden');
  }
  function showAdminLogin() {
    userAuthSection.classList.add('hidden');
    userSignupSection.classList.add('hidden');
    adminLoginSection.classList.remove('hidden');
  }
  function showUserDashboard() {
    authContainer.classList.add('hidden');
    userDashboard.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    easyfillSettingsContainer.style.display = 'none';
    loadTimesheetDraft();
  }
  function showAdminDashboard() {
    authContainer.classList.add('hidden');
    userDashboard.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
  }
  
  // Add event listener to handle saving work schedule
const workScheduleDropdown = document.getElementById('work-schedule');

workScheduleDropdown.addEventListener('change', async () => {
if (!currentUser) return;
const selectedSchedule = workScheduleDropdown.value;

// Save immediately to Firestore
await updateDoc(doc(db, 'users', currentUser.uid), {
  workSchedule: selectedSchedule
});

// Optionally set a local variable if you use it later in the code:
workSchedule = selectedSchedule;
});


  
  /*************************
   * Auth
   *************************/
  loginBtn.addEventListener('click', async () => {
    const email = loginEmailInput.value.trim();
    const pass = loginPasswordInput.value.trim();
    if (!email || !pass) {
      return alert("Please fill out all fields");
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      currentUser = cred.user;
      isAdmin = false;
      await fetchUserName();
      await loadUserEasyFillSettings();
      await loadUserCustomJobs();
      loadUserTimesheets();
      showUserDashboard();
    } catch (e) {
      alert(e.message);
    }
  });
  
  signupBtn.addEventListener('click', async () => {
    const fname = signupFirstNameInput.value.trim();
    const lname = signupLastNameInput.value.trim();
    const em = signupEmailInput.value.trim();
    const pw = signupPasswordInput.value.trim();
    if (!fname || !lname || !em || !pw) {
      return alert("Please fill out all fields");
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, em, pw);
      const uid = cred.user.uid;
      await setDoc(doc(db, 'users', uid), {
        firstName: fname,
        lastName: lname,
        email: em,
        createdAt: serverTimestamp()
      });
      currentUser = cred.user;
      currentUserName = `${fname} ${lname}`;
      isAdmin = false;
  
      // Create default EasyFill settings
      const defaultSettings = {
        Sunday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" },
        Monday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" },
        Tuesday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" },
        Wednesday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" },
        Thursday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" },
        Friday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" },
        Saturday: { start1: "09:00", end1: "12:00", start2: "13:00", end2: "17:00", job: "", comment: "" }
      };
      await setDoc(doc(db, 'easyfillsettings', uid), defaultSettings);
  
      // Create empty custom jobs doc
      await setDoc(doc(db, 'customjobs', uid), { jobs: [] });
  
      await loadUserEasyFillSettings();
      await loadUserCustomJobs();
      loadUserTimesheets();
      showUserDashboard();
    } catch (e) {
      alert(e.message);
    }
  });
  
  adminLoginBtn.addEventListener('click', async () => {
    const typed = adminPasswordInput.value.trim();
    if (!typed) return alert("Please enter admin password");
    if (typed === adminRealPassword) {
      try {
        const cred = await signInWithEmailAndPassword(auth, adminEmail, adminRealPassword);
        currentUser = cred.user;
        isAdmin = true;
        showAdminDashboard();
        loadAdminData();
      } catch (e) {
        alert(e.message);
      }
    } else {
      alert("Incorrect admin password");
    }
  });
  
  adminAccessLink.addEventListener('click', showAdminLogin);
  goToSignupLink.addEventListener('click', showUserSignup);
  goToLoginLink.addEventListener('click', showUserLogin);
  goToUserLoginLink.addEventListener('click', showUserLogin);
  
  forgotPasswordLink.addEventListener('click', async () => {
    const email = loginEmailInput.value.trim();
    if (!email) {
      alert("Please enter your email in the Email field first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert("A password reset link has been sent to your email. Please check your inbox (or spam folder).");
    } catch (e) {
      alert(e.message);
    }
  });
  
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    currentUser = null;
    currentUserName = "";
    isAdmin = false;
    showUserLogin();
    location.reload();
  });
  adminLogoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    currentUser = null;
    currentUserName = "";
    isAdmin = false;
    showUserLogin();
    location.reload();
  });
  
 onAuthStateChanged(auth, async (user) => {
if (!user) {
  showUserLogin();
  return;
}

if (user.email === adminEmail) {
  isAdmin = true;
  showAdminDashboard();
  loadAdminData();
} else {
  isAdmin = false;
  currentUser = user;
  await fetchUserName();
  await loadUserEasyFillSettings();
  await loadUserCustomJobs();
  userNameDisplay.textContent = currentUserName;
  showUserDashboard();
  loadUserTimesheets();
  await loadUserWorkSchedule();  // Add this line to load the user's work schedule
}
});

  
  /*************************
   * fetchUserName
   *************************/
  async function fetchUserName() {
    if (!currentUser) return;
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    if (snap.exists()) {
      const d = snap.data();
      currentUserName = `${d.firstName} ${d.lastName}`;
      userNameDisplay.textContent = currentUserName;
    }
  }
  
  
  
  
  
  // DOM elements

const saveScheduleBtn = document.getElementById('easyfill-edit-btn');

// Default work schedule is bi-weekly
let workSchedule = 'biweekly';

// Load the saved work schedule from Firestore
async function loadUserWorkSchedule() {
if (!currentUser) return;

const ref = doc(db, 'users', currentUser.uid);
const snap = await getDoc(ref);
if (snap.exists()) {
  const userData = snap.data();
  workSchedule = userData.workSchedule || 'biweekly';
  workScheduleDropdown.value = workSchedule;
}
}


// Save the selected work schedule
saveScheduleBtn.addEventListener('click', async () => {
const selectedSchedule = workScheduleDropdown.value;
workSchedule = selectedSchedule;
if (currentUser) {
  await updateDoc(doc(db, 'users', currentUser.uid), {
    workSchedule: selectedSchedule
  });
}
//alert('Work schedule updated!');
});

// Initialize on page load
loadUserWorkSchedule();

  
  
  /*************************
   * loadUserEasyFillSettings
   *************************/
  async function loadUserEasyFillSettings() {
    if (!currentUser) return;
    const ref = doc(db, 'easyfillsettings', currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      userEasyFillSettings = snap.data();
    } else {
      userEasyFillSettings = {
        Sunday:    {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""},
        Monday:    {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""},
        Tuesday:   {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""},
        Wednesday: {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""},
        Thursday:  {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""},
        Friday:    {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""},
        Saturday:  {start1:"09:00", end1:"12:00", start2:"13:00", end2:"17:00", job:"", comment:""}
      };
      await setDoc(ref, userEasyFillSettings);
    }
  }
  
  /*************************
   * loadUserCustomJobs
   *************************/
  async function loadUserCustomJobs() {
    if (!currentUser) return;
    const ref = doc(db, 'customjobs', currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      userCustomJobs = snap.data().jobs || [];
    } else {
      userCustomJobs = [];
      await setDoc(ref, { jobs: [] });
    }
    renderCustomJobsList();
  }
  
  /** Show the custom jobs in a list with delete and inline-edit */
  function renderCustomJobsList() {
    customJobsList.innerHTML = "";
    userCustomJobs.forEach((job, index) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.classList.add('job-text');
      span.textContent = job;
      // Double-click to edit
      span.addEventListener('dblclick', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = job;
        input.style.width = "100%";
        input.addEventListener('blur', async () => {
          const newVal = input.value.trim();
          if (newVal) {
            userCustomJobs[index] = newVal;
            await setDoc(doc(db, 'customjobs', currentUser.uid), { jobs: userCustomJobs });
            renderCustomJobsList();
          } else {
            // If empty, revert
            renderCustomJobsList();
          }
        });
        li.replaceChild(input, span);
        input.focus();
      });
  
      li.appendChild(span);
      // Delete button for each custom job
      const delBtn = document.createElement('button');
      delBtn.classList.add('delete-job');
      delBtn.textContent = "Delete";
      delBtn.addEventListener('click', async () => {
        if (confirm("Delete this custom job?")) {
          userCustomJobs.splice(index, 1);
          await setDoc(doc(db, 'customjobs', currentUser.uid), { jobs: userCustomJobs });
          renderCustomJobsList();
        }
      });
      li.appendChild(delBtn);
      customJobsList.appendChild(li);
    });
  }
  
  /** Add custom job */
  addCustomJobBtn.addEventListener('click', async () => {
    const newJob = customJobInput.value.trim();
    if (!newJob) {
      alert("Enter a job name first.");
      return;
    }
    userCustomJobs.push(newJob);
    await setDoc(doc(db, 'customjobs', currentUser.uid), { jobs: userCustomJobs });
    customJobInput.value = "";
    renderCustomJobsList();
  });
  
  /*************************
   * Timesheet creation
   *************************/
  createNewTimesheetBtn.addEventListener('click', () => {
    const payStart = getPayPeriodStartForToday();
    const isoDate = payStart.toISOString().split('T')[0];
    timesheetStartInput.value = isoDate;
  
    createNewTimesheetContainer.classList.add('hidden');
    timesheetStartSection.classList.remove('hidden');
    timesheetEntryContainer.classList.remove('hidden');
    renderTimesheetForm();
  });
  
  // Add input event listener for real-time validation
  timesheetStartInput.addEventListener('input', () => {
    if (!timesheetStartInput.value) return;
    
    const selectedDate = new Date(timesheetStartInput.value + 'T12:00:00');
    
    // Validate and correct the date if needed
    if (!isValidPayPeriodStartDate(selectedDate)) {
      const validDate = findNearestValidPayPeriodStart(selectedDate);
      const validDateStr = validDate.toISOString().split('T')[0];
      
      console.log('[DATE VALIDATION] Invalid date selected:', timesheetStartInput.value);
      console.log('[DATE VALIDATION] Corrected to:', validDateStr);
      
      // Update the input value
      timesheetStartInput.value = validDateStr;
      
      // Show a temporary message
      const existingMessage = document.getElementById('date-validation-message');
      if (existingMessage) {
        existingMessage.remove();
      }
      
      const message = document.createElement('div');
      message.id = 'date-validation-message';
      message.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #ff9800; color: white; padding: 10px 20px; border-radius: 4px; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-size: 14px;';
      message.textContent = `Date adjusted to valid pay period start: ${validDate.toLocaleDateString()}`;
      document.body.appendChild(message);
      setTimeout(() => {
        if (message.parentNode) {
          message.parentNode.removeChild(message);
        }
      }, 3000);
    }
  });

  timesheetStartInput.addEventListener('change', () => {
    if (!timesheetStartInput.value) return;
    
    // Final validation on change
    const selectedDate = new Date(timesheetStartInput.value + 'T12:00:00');
    if (!isValidPayPeriodStartDate(selectedDate)) {
      const validDate = findNearestValidPayPeriodStart(selectedDate);
      timesheetStartInput.value = validDate.toISOString().split('T')[0];
    }
    
    timesheetEntryContainer.classList.remove('hidden');
    renderTimesheetForm();
  });
  
  /** Easy Fill => fill times from user settings */
 easyFillBtn.addEventListener("click", () => {
const rows = timesheetFormDiv.querySelectorAll(".timesheet-row");
rows.forEach((r) => {
  const dt = r.getAttribute("data-date");
  const dObj = new Date(dt + "T12:00:00");
  const dayIdx = dObj.getDay();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dName = dayNames[dayIdx];

  const st1 = r.querySelector('input[name="start1"]');
  const et1 = r.querySelector('input[name="end1"]');
  const st2 = r.querySelector('input[name="start2"]');
  const et2 = r.querySelector('input[name="end2"]');
  const job = r.querySelector('select[name="jobDescription"]');
  const cmt = r.querySelector('input[name="comment"]');

  const ds = userEasyFillSettings[dName] || {};
  st1.value = ds.start1 || "";
  et1.value = ds.end1   || "";
  st2.value = ds.start2 || "";
  et2.value = ds.end2   || "";
  job.value = ds.job || "";
  cmt.value = ds.comment || "";
});

// Because the user didn't type these values, call saveTimesheetDraft() yourself:
saveTimesheetDraft();
});


  
  /** Export PDF (20px corners + smaller font) */
/* ---------- Export PDF (includes On Call hours) ---------- */
exportTimesheetBtn.addEventListener("click", () => {
  if (!timesheetStartInput.value) {
  alert("Please choose a start date first.");
  return;
}

const daysToAdd = workSchedule === "weekly" ? 6 : 13;
  const sObj = parseLocalDate(timesheetStartInput.value);
const eObj = new Date(sObj);
eObj.setDate(eObj.getDate() + daysToAdd);
  const endIso = `${eObj.getFullYear()}-${String(eObj.getMonth() + 1).padStart(2, "0")}-${String(eObj.getDate()).padStart(2, "0")}`;

  const entries = [];
  timesheetFormDiv.querySelectorAll(".timesheet-row").forEach(row => {
    const dt  = row.getAttribute("data-date");
    const st1Input = row.querySelector('input[name="start1"]');
    const et1Input = row.querySelector('input[name="end1"]');
    const st2Input = row.querySelector('input[name="start2"]');
    const et2Input = row.querySelector('input[name="end2"]');
    
    const st1Raw = st1Input ? st1Input.value : '';
    const et1Raw = et1Input ? et1Input.value : '';
    const st2Raw = st2Input ? st2Input.value : '';
    const et2Raw = et2Input ? et2Input.value : '';
    
    console.log('[EXPORT] Row for date:', dt);
    console.log('[EXPORT] Raw input values:', { st1Raw, et1Raw, st2Raw, et2Raw });
    
    const st1 = st1Raw.trim() || " ";
    const et1 = et1Raw.trim()   || " ";
    const st2 = st2Raw.trim() || " ";
    const et2 = et2Raw.trim()   || " ";
    
    console.log('[EXPORT] After trim and default:', { st1, et1, st2, et2 });

    const job = row.querySelector('select[name="jobDescription"]').value.trim() || " ";
    const cmt = row.querySelector('input[name="comment"]').value.trim()          || " ";

    /* NEW: grab any on‑call sessions already attached to the row */
    const onCallSessions = Array.isArray(row.onCallSessions) ? row.onCallSessions : [];

    /* NEW: include on‑call time in total hours */
    console.log('[EXPORT] Calling calculateTotalHours with:', { st1, et1, st2, et2 });
    const regularHours = calculateTotalHours(st1, et1, st2, et2);
    const onCallHours = calculateOnCallSessionsHours(onCallSessions);
    const totalHours = regularHours + onCallHours;
    console.log('[EXPORT] Calculated hours:', { regularHours, onCallHours, totalHours });

  entries.push({
    date: dt,
    start1: st1,
    end1: et1,
    start2: st2,
    end2: et2,
      onCallSessions,       // keep the array
      jobDescription: job,
      comment: cmt,
      totalHours
  });
});

printOrExportTimesheet({
  userName: currentUserName,
    startDate: timesheetStartInput.value,
  endDate: endIso,
    entries
});
});




  
  /** Submit Timesheet */
  // ---- EMAILJS: Send notification on timesheet submit ----
  // Make sure to add this to your index.html:
  // <script src="https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js"></script>
  // <script>emailjs.init("YOUR_USER_ID");</script>
  function sendTimesheetSubmittedEmail(userName, payPeriod, adminEmail) {
    if (typeof emailjs === 'undefined') return;
    emailjs.send("service_09kopw4", "template_bc2wnuf", {
      user: userName,
      pay_period: payPeriod,
      email: adminEmail
    })
    .then(function(response) {
      console.log("Email sent!", response.status, response.text);
    }, function(error) {
      console.error("Email failed:", error);
    });
  }
submitTimesheetBtn.addEventListener('click', async () => {
if (!currentUser) return;
const sv = timesheetStartInput.value;
if (!sv) return;

const confirmMsg = "By submitting this timesheet, you certify that you have received your mandated 30 minute lunch break along with two separate 10 minute breaks?";
if (!confirm(confirmMsg)) return;

const daysToAdd = workSchedule === "weekly" ? 6 : 13;
const sObj = parseLocalDate(sv);
const eObj = new Date(sObj);
eObj.setDate(eObj.getDate() + daysToAdd);
const eY = eObj.getFullYear();
const eM = String(eObj.getMonth() + 1).padStart(2, '0');
const eD = String(eObj.getDate()).padStart(2, '0');
const endIso = `${eY}-${eM}-${eD}`;

let entries = [];
const rows = timesheetFormDiv.querySelectorAll('.timesheet-row');
rows.forEach(r => {
  const dt = r.getAttribute('data-date');
  const st1Input = r.querySelector('input[name="start1"]');
  const et1Input = r.querySelector('input[name="end1"]');
  const st2Input = r.querySelector('input[name="start2"]');
  const et2Input = r.querySelector('input[name="end2"]');
  
  const st1Raw = st1Input ? st1Input.value : '';
  const et1Raw = et1Input ? et1Input.value : '';
  const st2Raw = st2Input ? st2Input.value : '';
  const et2Raw = et2Input ? et2Input.value : '';
  
  console.log('[SUBMIT] Row for date:', dt);
  console.log('[SUBMIT] Raw input values:', { st1Raw, et1Raw, st2Raw, et2Raw });
  
  const st1 = st1Raw.trim() || " ";
  const et1 = et1Raw.trim() || " ";
  const st2 = st2Raw.trim() || " ";
  const et2 = et2Raw.trim() || " ";
  
  console.log('[SUBMIT] After trim and default:', { st1, et1, st2, et2 });
  
  const jb = r.querySelector('select[name="jobDescription"]').value.trim() || " ";
  const cm = r.querySelector('input[name="comment"]').value.trim() || " ";
  // Get onCallSessions from draft if present
  let onCallSessions = [];
  const draft = JSON.parse(localStorage.getItem('timesheetDraft'));
  if (draft && draft.entries && draft.entries[dt] && Array.isArray(draft.entries[dt].onCallSessions)) {
    onCallSessions = draft.entries[dt].onCallSessions;
  }
  console.log('[SUBMIT] Calling calculateTotalHours with:', { st1, et1, st2, et2 });
  const regularHrs = calculateTotalHours(st1, et1, st2, et2);
  const onCallHrs = calculateOnCallSessionsHours(onCallSessions);
  const hrs = regularHrs + onCallHrs;
  console.log('[SUBMIT] Calculated hours:', { regularHrs, onCallHrs, total: hrs });
  entries.push({
    date: dt,
    start1: st1,
    end1: et1,
    start2: st2,
    end2: et2,
    jobDescription: jb,
    comment: cm,
    onCallSessions,
    totalHours: hrs
  });
});

await addDoc(collection(db, 'timesheets'), {
  userId: currentUser.uid,
  userName: currentUserName,
  userEmail: currentUser.email, // Save user's email for notifications
  startDate: sv,
  endDate: endIso,
  entries,
  submittedAt: serverTimestamp(),
  approved: false,
  unsubmitted: false,
  adminDeleted: false,
  userDeleted: false
});

// ---- EMAILJS: Send notification to admin ----
const payPeriod = `${sv} to ${endIso}`;
sendTimesheetSubmittedEmail(currentUserName, payPeriod, "becky@alcowater.com");

timesheetStartInput.value = "";
timesheetFormDiv.innerHTML = "";
timesheetEntryContainer.classList.add('hidden');
timesheetStartSection.classList.add('hidden');
createNewTimesheetContainer.classList.remove('hidden');
loadUserTimesheets();

localStorage.removeItem('timesheetDraft');


});
  
  /** Cancel creation */
  cancelTimesheetBtn.addEventListener('click', () => {
    timesheetStartInput.value = "";
    timesheetFormDiv.innerHTML = "";
    timesheetEntryContainer.classList.add('hidden');
    timesheetStartSection.classList.add('hidden');
    createNewTimesheetContainer.classList.remove('hidden');
     localStorage.removeItem('timesheetDraft');
  });
  
  /** Render a 2-week table from selected start date (with data-label for mobile). */
 // Modify the renderTimesheetForm to account for the work schedule
  
  
  
  
async function renderTimesheetForm(existingDraft) {
  await loadUserWorkSchedule();
  timesheetFormDiv.innerHTML = "";
  const sv = timesheetStartInput.value;
  if (!sv) return;

  const draftEntries = existingDraft || 
      JSON.parse(localStorage.getItem('timesheetDraft'))?.entries || {};

  const daysCount = workSchedule === "weekly" ? 7 : 14;
  const start = parseLocalDate(sv);
  const table = document.createElement('table');
  table.style.tableLayout = 'fixed';

  const thead = document.createElement('thead');
  const thr = document.createElement('tr');
  ["Date","Start Time:","End Time:","Start Time:","End Time:","On Call Hours","Job Description:","Comment:"].forEach((txt, idx) => {
      const th = document.createElement('th');
      if (txt === 'On Call Hours') {
        th.classList.add('on-call-header');
        th.innerHTML = '<span>On Call Hours</span><br>';
        th.style.minWidth = '150px';
        th.style.width = '150px';
      } else {
      th.textContent = txt;
      }
      thr.appendChild(th);
  });
  thead.appendChild(thr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const combinedJobs = getCombinedJobs();

  for (let i = 0; i < daysCount; i++) {
      const row = document.createElement('tr');
      row.classList.add('timesheet-row');

      const cur = new Date(start);
      cur.setDate(cur.getDate() + i);
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate() + '').padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;
      row.setAttribute('data-date', iso);

      const draftData = draftEntries[iso] || {};
      // Ensure onCallSessions is always an array
      if (!Array.isArray(draftData.onCallSessions)) draftData.onCallSessions = [];
      row.onCallSessions = draftData.onCallSessions; // keep a live copy

      const wdShort = cur.toLocaleDateString('en-US', { weekday: 'short' });
      const dtShort = cur.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      const dateTd = document.createElement('td');
      dateTd.textContent = `${wdShort} (${dtShort})`;

      const createTimeInput = (name) => {
          const input = document.createElement('input');
          input.type = 'time';
          input.name = name;
          input.value = draftData[name] || '';
          input.addEventListener('input', saveTimesheetDraft);
          return input;
      };

      // Start/End time cells
const st1Td = document.createElement('td');
st1Td.setAttribute('data-label', 'Start Time');
const st1Input = createTimeInput('start1');
st1Td.appendChild(st1Input);

const et1Td = document.createElement('td');
et1Td.setAttribute('data-label', 'End Time');
const et1Input = createTimeInput('end1');
et1Td.appendChild(et1Input);

const st2Td = document.createElement('td');
st2Td.setAttribute('data-label', 'Start Time');
const st2Input = createTimeInput('start2');
st2Td.appendChild(st2Input);

const et2Td = document.createElement('td');
et2Td.setAttribute('data-label', 'End Time');
const et2Input = createTimeInput('end2');
et2Td.appendChild(et2Input);

      // On Call Hours cell
      const onCallTd = document.createElement('td');
      onCallTd.setAttribute('data-label', 'On Call Hours');
      onCallTd.style.textAlign = 'center';
      onCallTd.style.minWidth = '150px';
      onCallTd.style.width = '150px';
      onCallTd.style.display        = 'flex';
      onCallTd.style.flexDirection  = 'column';
      onCallTd.style.alignItems     = 'center';
      onCallTd.style.justifyContent = 'center';

      let onCallUI = null;
      let onCallInputsVisible = false;
      const addOnCallBtn = document.createElement('button');
      addOnCallBtn.textContent = 'Add On Call Hours';
      addOnCallBtn.classList.add('add-on-call-btn');

      function renderOnCallUI() {
        // Remove previous session list if present
        const prevList = onCallTd.querySelector('.on-call-session-list');
        if (prevList) onCallTd.removeChild(prevList);
        // Create session list
        const sessionList = document.createElement('div');
        sessionList.classList.add('on-call-session-list');
        sessionList.style.width = '100%';
        sessionList.style.marginBottom = '0.5rem';
        if (row.onCallSessions && row.onCallSessions.length > 0) {
          row.onCallSessions.forEach((sess, idx) => {
            const sessDiv = document.createElement('div');
            sessDiv.style.display = 'flex';
            sessDiv.style.flexDirection = 'column';
            sessDiv.style.alignItems = 'center';
            sessDiv.style.marginBottom = '0.25rem';
            // Session time
            const timeSpan = document.createElement('span');
            timeSpan.textContent = `${formatTime24ToAmPm(sess.start)} - ${formatTime24ToAmPm(sess.end)}`;
            sessDiv.appendChild(timeSpan);
            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.style.background = '#ff4d4d';
            removeBtn.style.color = '#fff';
            removeBtn.style.border = 'none';
            removeBtn.style.borderRadius = '4px';
            removeBtn.style.fontSize = '0.75rem';
            removeBtn.style.marginTop = '2px';
            removeBtn.style.padding = '2px 8px';
            removeBtn.onclick = async () => {
              row.onCallSessions.splice(idx, 1);
              draftData.onCallSessions = row.onCallSessions;
              saveTimesheetDraft();
              renderOnCallUI();
            };
            sessDiv.appendChild(removeBtn);
            sessionList.appendChild(sessDiv);
          });
        }
        onCallTd.insertBefore(sessionList, addOnCallBtn);
      }

      function showOnCallInputs() {
        if (onCallUI && onCallUI.parentNode === onCallTd) {
          onCallTd.removeChild(onCallUI);
        }
        onCallUI = document.createElement('div');
        onCallUI.classList.add('on-call-inputs-mobile');
        onCallUI.style.marginBottom = '0.5rem';
        const startDiv = document.createElement('div');
        startDiv.style.marginBottom = '0.25rem';
        const startLabel = document.createElement('label');
        startLabel.textContent = 'Start:';
        startLabel.style.marginRight = '0.5rem';
        const startInput = document.createElement('input');
        startInput.type = 'time';
        startInput.value = '';
        startDiv.appendChild(startLabel);
        startDiv.appendChild(startInput);

        const endDiv = document.createElement('div');
        endDiv.style.marginBottom = '0.25rem';
        const endLabel = document.createElement('label');
        endLabel.textContent = 'End:';
        endLabel.style.marginRight = '0.5rem';
        const endInput = document.createElement('input');
        endInput.type = 'time';
        endInput.value = '';
        endDiv.appendChild(endLabel);
        endDiv.appendChild(endInput);

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.display = 'block';
        saveBtn.style.marginTop = '0.25rem';
        saveBtn.style.marginLeft = 'auto';
        saveBtn.style.marginRight = 'auto';
        saveBtn.onclick = () => {
          if (startInput.value && endInput.value) {
            const sess = { start: startInput.value, end: endInput.value };
            draftData.onCallSessions.push(sess);
            row.onCallSessions = draftData.onCallSessions; // sync row copy
            saveTimesheetDraft();
            renderOnCallUI();
            // After saving, hide the input UI and reset button
            if (onCallUI && onCallUI.parentNode === onCallTd) {
              onCallTd.removeChild(onCallUI);
            }
            addOnCallBtn.textContent = 'Add On Call Hours';
            addOnCallBtn.classList.remove('is-cancel'); // remove this
            onCallInputsVisible = false;
          }
        };

        onCallUI.appendChild(startDiv);
        onCallUI.appendChild(endDiv);
        onCallUI.appendChild(saveBtn);
        onCallTd.insertBefore(onCallUI, addOnCallBtn);
      }

      addOnCallBtn.onclick = function() {
        if (!onCallInputsVisible) {
          showOnCallInputs();
          addOnCallBtn.textContent = 'Cancel';
          addOnCallBtn.classList.add('is-cancel'); // add this
          onCallInputsVisible = true;
        } else {
          // Hide the input UI only
          if (onCallUI && onCallUI.parentNode === onCallTd) {
            onCallTd.removeChild(onCallUI);
          }
          addOnCallBtn.textContent = 'Add On Call Hours';
          addOnCallBtn.classList.remove('is-cancel'); // remove this
          onCallInputsVisible = false;
        }
      };
      onCallTd.appendChild(addOnCallBtn);
      renderOnCallUI();

      const jobSelect = document.createElement('select');
      jobSelect.name = 'jobDescription';
      jobSelect.addEventListener('change', saveTimesheetDraft);
      
      const emptyOption = document.createElement('option');
      emptyOption.value = "";
      emptyOption.textContent = "(Select Job)";
      emptyOption.selected = !draftData.job;
      jobSelect.appendChild(emptyOption);
      
      combinedJobs.forEach(job => {
          const option = document.createElement('option');
          option.value = job;
          option.textContent = job;
          option.selected = job === draftData.job;
          jobSelect.appendChild(option);
      });

      const commentInput = document.createElement('input');
      commentInput.type = 'text';
      commentInput.name = 'comment';
      commentInput.value = draftData.comment || '';
      commentInput.addEventListener('input', saveTimesheetDraft);

      const jobTd = document.createElement('td');
      jobTd.appendChild(jobSelect);
      
      const commentTd = document.createElement('td');
      commentTd.appendChild(commentInput);

      // Function to log and calculate total hours (hidden from UI but logged for debugging)
      const updateTotalHours = () => {
        const st1Val = st1Input.value.trim() || " ";
        const et1Val = et1Input.value.trim() || " ";
        const st2Val = st2Input.value.trim() || " ";
        const et2Val = et2Input.value.trim() || " ";
        
        console.log('[FORM] ===== UPDATING TOTAL HOURS =====');
        console.log('[FORM] Row date:', iso);
        console.log('[FORM] Raw input values:', { 
          st1Raw: st1Input.value, 
          et1Raw: et1Input.value, 
          st2Raw: st2Input.value, 
          et2Raw: et2Input.value 
        });
        console.log('[FORM] After trim/default:', { st1Val, et1Val, st2Val, et2Val });
        
        const regularHrs = calculateTotalHours(st1Val, et1Val, st2Val, et2Val);
        const onCallHrs = calculateOnCallSessionsHours(row.onCallSessions || []);
        const total = regularHrs + onCallHrs;
        
        console.log('[FORM] Final calculation:', { regularHrs, onCallHrs, total });
        console.log('[FORM] ===== END UPDATE =====');
      };
      
      // Add immediate logging and calculate total hours when any time input changes
      st1Input.addEventListener('input', (e) => {
        console.log('[FORM INPUT] start1 changed to:', e.target.value, 'for date:', iso);
        saveTimesheetDraft();
        updateTotalHours();
      });
      et1Input.addEventListener('input', (e) => {
        console.log('[FORM INPUT] end1 changed to:', e.target.value, 'for date:', iso);
        saveTimesheetDraft();
        updateTotalHours();
      });
      st2Input.addEventListener('input', (e) => {
        console.log('[FORM INPUT] start2 changed to:', e.target.value, 'for date:', iso);
        saveTimesheetDraft();
        updateTotalHours();
      });
      et2Input.addEventListener('input', (e) => {
        console.log('[FORM INPUT] end2 changed to:', e.target.value, 'for date:', iso);
        saveTimesheetDraft();
        updateTotalHours();
      });
      
      // Initial calculation
      updateTotalHours();

      row.appendChild(dateTd);
      row.appendChild(st1Td);
      row.appendChild(et1Td);
      row.appendChild(st2Td);
      row.appendChild(et2Td);
      row.appendChild(onCallTd);
      row.appendChild(jobTd);
      row.appendChild(commentTd);

      tbody.appendChild(row);
  }

  table.appendChild(tbody);
  timesheetFormDiv.appendChild(table);
}

function createTimeInput(name) {
const td = document.createElement('td');
td.setAttribute("data-label", name.charAt(0).toUpperCase() + name.slice(1).replace(/[A-Z]/g, ' $&'));
const input = document.createElement('input');
input.type = 'time';
input.name = name;
td.appendChild(input);
return td;
}

function createJobSelect(combinedJobs) {
const td = document.createElement('td');
const select = document.createElement('select');
select.name = 'jobDescription';
const emptyOption = document.createElement('option');
emptyOption.value = "";
emptyOption.textContent = "(Select a job)";
select.appendChild(emptyOption);
combinedJobs.forEach(job => {
  const option = document.createElement('option');
  option.value = job;
  option.textContent = job;
  select.appendChild(option);
});
td.appendChild(select);
return td;
}

function createTextInput(name) {
const td = document.createElement('td');
td.setAttribute("data-label", "Comment:");
const input = document.createElement('input');
input.type = 'text';
input.name = name;
td.appendChild(input);
return td;
}

function getCombinedJobs() {
// Combine default jobs + user custom jobs
const defaultJobs = [
  "Meter Reader","Pump Maintenance","Customer Service","Utilities Maintenance",
  "GIS/Mapping","Water Operator","Holiday","Paid Time Off",
  "Hauling services","After Hours"
];
return [...defaultJobs, ...userCustomJobs].sort((a, b) => a.localeCompare(b));
}

  
  /*************************
   * Load user timesheets (Past)
   *************************/
 /*************************
 * Load user timesheets (Past + Contested)
   *************************/
  async function loadUserTimesheets() {
    if (!currentUser) return;

  // Pull every timesheet that still belongs to the user
  const qSnap = await getDocs(
    query(collection(db, "timesheets"), where("userId", "==", currentUser.uid))
  );

    pastTimesheetsDiv.innerHTML = "";
  let contestedArr = [];
  let normalArr = [];

  if (!qSnap.empty) {
    qSnap.forEach((s) => {
      const d = s.data();
      if (d.userDeleted !== true) {
        if (d.contested === true) {
          contestedArr.push({ id: s.id, ...d });
        } else {
          normalArr.push({ id: s.id, ...d });
        }
      }
    });
  }

  // Newest first
  contestedArr.sort((a, b) => b.startDate.localeCompare(a.startDate));
  normalArr.sort((a, b) => b.startDate.localeCompare(a.startDate));

  /* ------------ contested section ------------ */
  let contestedSection = document.getElementById("contested-timesheets-div");
  const pastHeading = pastTimesheetsDiv.previousElementSibling; // <h3>Past Timesheets</h3>

  // Only create the wrapper once
  if (!contestedSection) {
    contestedSection = document.createElement("div");
    contestedSection.id = "contested-timesheets-div";
    // Insert right before the Past Timesheets heading
    pastHeading.parentNode.insertBefore(contestedSection, pastHeading);
  }
  contestedSection.innerHTML = "";

  if (contestedArr.length > 0) {
    const heading = document.createElement("h3");
    heading.textContent = "Contested Timesheets";
    contestedSection.appendChild(heading);

    contestedArr.forEach((ts) => {
      contestedSection.appendChild(buildTimesheetCard(ts, true));
    });
  }

  /* ------------ past (normal) section ------------ */
  pastTimesheetsDiv.innerHTML = "";
  if (normalArr.length === 0) {
      pastTimesheetsDiv.textContent = "You currently have no timesheets.";
  } else {
    normalArr.forEach((ts) => {
      pastTimesheetsDiv.appendChild(buildTimesheetCard(ts, false));
    });
  }
}

/* helper that returns the DOM node for a single timesheet
   keep the second parameter "isContested" just for styling later */
function buildTimesheetCard(ts, isContested) {
  const item = document.createElement("div");
  item.classList.add("timesheet-item");

  const head = document.createElement("div");
  head.classList.add("timesheet-item-header");
  head.innerHTML =
    (isContested ? '<span style="color:red">*</span> ' : "") +
    `Timesheet<br>${ts.startDate} - ${ts.endDate}`;
  item.appendChild(head);

  // If contested and has admin comment, show it in a styled box
  let adminCommentBox = null;
  if (isContested && ts.adminEditComment) {
    adminCommentBox = document.createElement("div");
    adminCommentBox.style.background = "#f7f7f7";
    adminCommentBox.style.border = "1px solid #bbb";
    adminCommentBox.style.borderRadius = "8px";
    adminCommentBox.style.padding = "1rem";
    adminCommentBox.style.margin = "1rem 0";
    adminCommentBox.style.fontSize = "1.1rem";
    adminCommentBox.style.color = "#333";
    adminCommentBox.textContent = ts.adminEditComment;
    item.appendChild(adminCommentBox);
  }

  const details = document.createElement("div");
  details.classList.add("timesheet-details", "hidden", "user-view");

  // For contested timesheets, allow editing
  let edited = false;
  let editedEntries = JSON.parse(JSON.stringify(ts.entries));
  let contestCommentBox = null;
  let contestCommentWrapper = null;
  let contestBtn = null;
  let approveBtn = null;
  let updateContestUI = () => {};

  // buildTimesheetTable: editable for contested, else not
  if (isContested) {
    // Define updateContestUI in this scope so it can be used in onEdit
    updateContestUI = function() {
      if (approveBtn) approveBtn.style.display = edited ? "none" : "";
      if (contestBtn) contestBtn.style.display = edited ? "" : "none";
      if (contestCommentWrapper) contestCommentWrapper.style.display = edited ? "block" : "none";
    };
    details.appendChild(buildEditableTimesheetTable(ts.entries, editedEntries, function() {
      edited = true;
      updateContestUI();
    }));
  } else {
    details.appendChild(buildTimesheetTable(ts.entries));
  }

  // Button group
  const btnWrap = document.createElement("div");
  btnWrap.classList.add("inline-button-group");
  const viewBtn = document.createElement("button");
  viewBtn.textContent = "View";
  viewBtn.onclick = () => {
    details.classList.toggle("hidden");
    viewBtn.textContent = details.classList.contains("hidden") ? "View" : "Back";
    // When opening, update UI in case edits were made
    if (isContested) updateContestUI();
  };
  btnWrap.appendChild(viewBtn);

  // Add Delete button for non-contested (past) timesheets only
  if (!isContested) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.style.marginLeft = "0.5rem";
    deleteBtn.onclick = async () => {
      if (!confirm("Delete this timesheet from your view?")) return;
      await updateDoc(doc(db, "timesheets", ts.id), { userDeleted: true });
      loadUserTimesheets();
    };
    btnWrap.appendChild(deleteBtn);
  }

  // Approve/Contest logic for contested timesheets
  if (isContested) {
    // Approve button (default)
    approveBtn = document.createElement("button");
    approveBtn.textContent = "Approve";
    approveBtn.style.marginLeft = "0.5rem";
    approveBtn.onclick = async () => {
      await updateDoc(doc(db, "timesheets", ts.id), {
        contested: false,
        adminEditComment: deleteField()
      });
      loadUserTimesheets();
    };
    btnWrap.appendChild(approveBtn);

    // Contest button (hidden by default)
    contestBtn = document.createElement("button");
    contestBtn.textContent = "Contest";
    contestBtn.style.marginLeft = "0.5rem";
    contestBtn.style.display = "none";
    contestBtn.onclick = async () => {
      if (!contestCommentBox.value.trim()) {
        contestCommentBox.focus();
        contestCommentBox.style.borderColor = "red";
        contestCommentBox.placeholder = "Please enter a comment before contesting.";
      return;
    }
      await updateDoc(doc(db, "timesheets", ts.id), {
        entries: editedEntries,
        contested: true,
        adminEditComment: contestCommentBox.value.trim()
      });
      // Send contest email to admin (not user)
      sendTimesheetContestedEmail({
        toEmail: "becky@alcowater.com",
        userName: ts.userName,
        startDate: ts.startDate,
        endDate: ts.endDate
      });
      details.classList.add("hidden");
      viewBtn.textContent = "View";
      loadUserTimesheets();
    };
    btnWrap.appendChild(contestBtn);

    // Contest comment box (hidden by default)
    contestCommentWrapper = document.createElement("div");
    contestCommentWrapper.style.display = "none";
    contestCommentWrapper.style.margin = "1rem 0";
    contestCommentWrapper.style.width = "100%";
    contestCommentWrapper.style.textAlign = "center";
    contestCommentBox = document.createElement("textarea");
    contestCommentBox.rows = 4;
    contestCommentBox.style.width = "90%";
    contestCommentBox.style.maxWidth = "600px";
    contestCommentBox.style.fontSize = "1.1rem";
    contestCommentBox.style.padding = "0.5rem";
    contestCommentBox.style.border = "1px solid #ccc";
    contestCommentBox.style.borderRadius = "8px";
    contestCommentBox.placeholder = "Enter contest comments here";
    contestCommentWrapper.appendChild(contestCommentBox);
    details.appendChild(contestCommentWrapper);

    // Initial UI state
    updateContestUI();
  }

  item.appendChild(details);
  item.appendChild(btnWrap);

  return item;
}

// Helper: editable table for user contesting
function buildEditableTimesheetTable(entries, editedEntries, onEdit) {
  const tw = document.createElement("div");
  tw.classList.add("table-wrapper");

  const t = document.createElement("table");
  t.style.tableLayout = "fixed";
  t.style.borderRadius = "20px";
  t.style.overflow = "hidden";

  const thead = document.createElement("thead");
  const thr = document.createElement("tr");
  ["Date", "Start", "End", "Start", "End", "Job", "Comment", "Total Hrs"].forEach((tx) => {
    const th = document.createElement("th");
        th.textContent = tx;
        thr.appendChild(th);
      });
      thead.appendChild(thr);
      t.appendChild(thead);
  
  const tbody = document.createElement("tbody");
  entries.forEach((e, idx) => {
        if (idx === 7) {
      const spacer = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      spacer.appendChild(td);
      tbody.appendChild(spacer);
    }
    const row = document.createElement("tr");
    const dObj = new Date(e.date + "T12:00:00");
    const dateCell = document.createElement("td");
    dateCell.innerHTML =
      `${dObj.toLocaleDateString("en-US", { weekday: "short" })}<br>` +
      `(${dObj.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      })})`;
    row.appendChild(dateCell);

    // Editable time fields
    ["start1", "end1", "start2", "end2"].forEach((k) => {
      const td = document.createElement("td");
      const span = document.createElement("span");
      span.textContent = formatTime24ToAmPm(e[k] === " " ? "" : e[k]);
      span.style.cursor = "pointer";
      span.ondblclick = function () {
        const input = document.createElement("input");
        input.type = "time";
        input.value = e[k] && e[k] !== " " ? e[k] : "";
        input.onblur = function () {
          const newVal = input.value;
          span.textContent = formatTime24ToAmPm(newVal);
          td.replaceChild(span, input);
          if (newVal !== e[k]) {
            editedEntries[idx][k] = newVal;
            // recalc total hours
            console.log('[buildEditableTimesheetTable] Recalculating hours after edit');
            console.log('[buildEditableTimesheetTable] Entry values:', {
              start1: editedEntries[idx].start1,
              end1: editedEntries[idx].end1,
              start2: editedEntries[idx].start2,
              end2: editedEntries[idx].end2
            });
            editedEntries[idx].totalHours =
              calculateTotalHours(editedEntries[idx].start1, editedEntries[idx].end1, editedEntries[idx].start2, editedEntries[idx].end2);
            console.log('[buildEditableTimesheetTable] New total hours:', editedEntries[idx].totalHours);
            onEdit();
          }
        };
        input.onkeydown = function (ev) {
          if (ev.key === "Enter") input.blur();
        };
        td.replaceChild(input, span);
        input.focus();
      };
      td.appendChild(span);
      row.appendChild(td);
    });

    // Editable job select
    const jobCell = document.createElement("td");
    const jobSpan = document.createElement("span");
    jobSpan.textContent = e.jobDescription === " " ? " " : e.jobDescription;
    jobSpan.style.cursor = "pointer";
    jobSpan.ondblclick = function () {
      const select = document.createElement("select");
      const jobs = getCombinedJobs();
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "(Select a job)";
      select.appendChild(emptyOpt);
      jobs.forEach((j) => {
        const opt = document.createElement("option");
        opt.value = j;
        opt.textContent = j;
        if (j === e.jobDescription) opt.selected = true;
        select.appendChild(opt);
      });
      select.onblur = function () {
        const newVal = select.value;
        jobSpan.textContent = newVal;
        jobCell.replaceChild(jobSpan, select);
        if (newVal !== e.jobDescription) {
          editedEntries[idx].jobDescription = newVal;
          onEdit();
        }
      };
      select.onkeydown = function (ev) {
        if (ev.key === "Enter") select.blur();
      };
      jobCell.replaceChild(select, jobSpan);
      select.focus();
    };
    jobCell.appendChild(jobSpan);
    row.appendChild(jobCell);

    // Editable comment
    const cmtCell = document.createElement("td");
    const cmtSpan = document.createElement("span");
    cmtSpan.textContent = e.comment === " " ? " " : e.comment;
    cmtSpan.style.cursor = "pointer";
    cmtSpan.ondblclick = function () {
      const input = document.createElement("input");
      input.type = "text";
      input.value = e.comment && e.comment !== " " ? e.comment : "";
      input.onblur = function () {
        const newVal = input.value;
        cmtSpan.textContent = newVal;
        cmtCell.replaceChild(cmtSpan, input);
        if (newVal !== e.comment) {
          editedEntries[idx].comment = newVal;
          onEdit();
        }
      };
      input.onkeydown = function (ev) {
        if (ev.key === "Enter") input.blur();
      };
      cmtCell.replaceChild(input, cmtSpan);
      input.focus();
    };
    cmtCell.appendChild(cmtSpan);
    row.appendChild(cmtCell);

    // Total hours
    const hrsCell = document.createElement("td");
    hrsCell.textContent = (isNaN(e.totalHours) ? 0 : e.totalHours).toFixed(2);
    row.appendChild(hrsCell);

    tbody.appendChild(row);
  });

  t.appendChild(tbody);
  tw.appendChild(t);
  return tw;
}

// Helper to calculate on call hours for a list of sessions
function calculateOnCallSessionsHours(sessions) {
  if (!Array.isArray(sessions)) return 0;
  let total = 0;
  sessions.forEach(sess => {
    if (sess && sess.start && sess.end) {
      const [sh, sm] = sess.start.split(':').map(Number);
      const [eh, em] = sess.end.split(':').map(Number);
      const sTot = sh * 60 + sm;
      const eTot = eh * 60 + em;
      if (eTot > sTot) total += (eTot - sTot) / 60;
    }
  });
  return total;
}

// Update buildTimesheetTable to show On Call Hours and include in total
function buildTimesheetTable(entries) {
  const tw = document.createElement("div");
  tw.classList.add("table-wrapper");

  const t = document.createElement("table");
  t.style.tableLayout = "fixed";
  t.style.borderRadius = "20px";
  t.style.overflow = "hidden";

  const thead = document.createElement("thead");
  const thr = document.createElement("tr");
  ["Date", "Start", "End", "Start", "End", "On Call Hours", "Job", "Comment", "Total Hrs"].forEach(
    (tx) => {
      const th = document.createElement("th");
      if (tx === 'On Call Hours') {
        th.classList.add('on-call-header');
        th.innerHTML = '<span>On Call Hours</span><br>';
        th.style.minWidth = '150px';
        th.style.width = '150px';
        } else {
        th.textContent = tx;
      }
      thr.appendChild(th);
    }
  );
  thead.appendChild(thr);
  t.appendChild(thead);

  const tbody = document.createElement("tbody");
  entries.forEach((e, idx) => {
    if (idx === 7) {
      const spacer = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 9;
      spacer.appendChild(td);
      tbody.appendChild(spacer);
    }

    const row = document.createElement("tr");

    const dObj = new Date(e.date + "T12:00:00");
    const dateCell = document.createElement("td");
    dateCell.innerHTML =
      `${dObj.toLocaleDateString("en-US", { weekday: "short" })}<br>` +
      `(${dObj.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      })})`;
    row.appendChild(dateCell);

    ["start1", "end1", "start2", "end2"].forEach((k) => {
      const td = document.createElement("td");
      td.textContent = formatTime24ToAmPm(e[k] === " " ? "" : e[k]);
      row.appendChild(td);
    });

    // On Call Hours column
    const onCallTd = document.createElement("td");
    onCallTd.style.textAlign = 'center';
    onCallTd.style.minWidth = '150px';
    onCallTd.style.width = '150px';
    if (Array.isArray(e.onCallSessions) && e.onCallSessions.length > 0) {
      e.onCallSessions.forEach(sess => {
        const sessDiv = document.createElement('div');
        sessDiv.textContent = `${formatTime24ToAmPm(sess.start)} - ${formatTime24ToAmPm(sess.end)}`;
        onCallTd.appendChild(sessDiv);
      });
    }
    row.appendChild(onCallTd);

    const jobCell = document.createElement("td");
    jobCell.textContent = e.jobDescription === " " ? " " : e.jobDescription;
    row.appendChild(jobCell);

    const cmtCell = document.createElement("td");
    cmtCell.textContent = e.comment === " " ? " " : e.comment;
    row.appendChild(cmtCell);

    // Total hours: sum of regular + on call
    const hrsCell = document.createElement("td");
    console.log('[buildTimesheetTable] Entry for date:', e.date);
    console.log('[buildTimesheetTable] Entry values:', { start1: e.start1, end1: e.end1, start2: e.start2, end2: e.end2 });
    console.log('[buildTimesheetTable] Calling calculateTotalHours');
    let totalHrs = calculateTotalHours(e.start1, e.end1, e.start2, e.end2);
    const onCallHrs = calculateOnCallSessionsHours(e.onCallSessions);
    totalHrs += onCallHrs;
    console.log('[buildTimesheetTable] Final total hours:', totalHrs);
    hrsCell.textContent = (isNaN(totalHrs) ? 0 : totalHrs).toFixed(2);
    row.appendChild(hrsCell);

    tbody.appendChild(row);
  });

  t.appendChild(tbody);
  tw.appendChild(t);

  return tw;
  }
  
  /*************************
   * ADMIN
   *************************/
  async function loadAdminData() {
    const all = await getDocs(collection(db, 'timesheets'));
    const userMapPending = {};
    const userMapApproved = {};
  
    all.forEach(ds => {
      const data = ds.data();
      const { userId, userName, approved, unsubmitted, adminDeleted } = data;
      if (adminDeleted) return;
      if (!approved && !unsubmitted) {
        if (!userMapPending[userId]) {
          userMapPending[userId] = { userName: userName || "Unknown", timesheets: [] };
        }
        userMapPending[userId].timesheets.push({ id: ds.id, ...data });
      } else if (approved) {
        if (!userMapApproved[userId]) {
          userMapApproved[userId] = { userName: userName || "Unknown", timesheets: [] };
        }
        userMapApproved[userId].timesheets.push({ id: ds.id, ...data });
      }
    });
  
    adminUsersWrapper.innerHTML = "";
    adminApprovedWrapper.innerHTML = "";
    adminPendingViewContainer.innerHTML = "";
    adminApprovedViewContainer.innerHTML = "";
    adminPendingViewContainer.classList.add('hidden');
    adminApprovedViewContainer.classList.add('hidden');
    adminUsersWrapper.classList.remove('hidden');
    adminApprovedWrapper.classList.remove('hidden');
  
    // Pending timesheets
    const pUids = Object.keys(userMapPending).sort((a, b) =>
      userMapPending[a].userName.localeCompare(userMapPending[b].userName));
    if (pUids.length === 0) {
      adminUsersWrapper.innerHTML = "<p>You currently have no timesheets pending approval.</p>";
    } else {
      const pendingTableHTML = `
        <table id="admin-users-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="admin-users-tbody"></tbody>
        </table>
      `;
      adminUsersWrapper.innerHTML = pendingTableHTML;
      const newTbody = document.getElementById('admin-users-tbody');
      pUids.forEach(uid => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-uid', uid); // PATCH: add userId for context menu
        const nameTd = document.createElement('td');
        const userName = userMapPending[uid].userName;
        window._adminUserIdMap = window._adminUserIdMap || {};
        window._adminUserIdMap[userName] = uid; // PATCH: fill map
        // Check if any pending timesheet for this user is contested
        const hasContested = userMapPending[uid].timesheets.some(ts => ts.contested === true);
        nameTd.innerHTML = (hasContested ? '<span style="color:red">*</span> ' : '') + "<strong>" + userName + "</strong>";
        tr.appendChild(nameTd);
  
        const actionTd = document.createElement('td');
        const vBtn = document.createElement('button');
        vBtn.textContent = "View Timesheets";
        vBtn.addEventListener('click', () => {
          adminUsersWrapper.classList.add('hidden');
          adminApprovedWrapper.classList.remove('hidden');
          adminPendingViewContainer.innerHTML = "";
          adminPendingViewContainer.classList.remove('hidden');
          adminApprovedViewContainer.classList.add('hidden');
          adminLogoutBtn.classList.add('hidden');
  
          showAdminUserTimesheets(
            uid,
            userMapPending[uid].userName,
            userMapPending[uid].timesheets,
            false,
            adminPendingViewContainer
          );
        });
        actionTd.appendChild(vBtn);
        tr.appendChild(actionTd);
        newTbody.appendChild(tr);
      });
    }
  
    // Approved timesheets
    const aUids = Object.keys(userMapApproved).sort((a, b) =>
      userMapApproved[a].userName.localeCompare(userMapApproved[b].userName));
    if (aUids.length === 0) {
      adminApprovedWrapper.innerHTML = "<p>You have no approved timesheets</p>";
    } else {
      const approvedTableHTML = `
        <table id="admin-approved-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="admin-approved-tbody"></tbody>
        </table>
      `;
      adminApprovedWrapper.innerHTML = approvedTableHTML;
      const newTbody = document.getElementById('admin-approved-tbody');
      aUids.forEach(uid => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-uid', uid); // PATCH: add userId for context menu
        const nameTd = document.createElement('td');
        const userName = userMapApproved[uid].userName;
        window._adminUserIdMap = window._adminUserIdMap || {};
        window._adminUserIdMap[userName] = uid; // PATCH: fill map
        nameTd.innerHTML = "<strong>" + userName + "</strong>";
        tr.appendChild(nameTd);
  
        const actionTd = document.createElement('td');
        const vBtn = document.createElement('button');
        vBtn.textContent = "View Timesheets";
        vBtn.addEventListener('click', () => {
          adminApprovedWrapper.classList.add('hidden');
          adminUsersWrapper.classList.remove('hidden');
          adminApprovedViewContainer.innerHTML = "";
          adminApprovedViewContainer.classList.remove('hidden');
          adminPendingViewContainer.classList.add('hidden');
          adminLogoutBtn.classList.add('hidden');
  
          showAdminUserTimesheets(
            uid,
            userMapApproved[uid].userName,
            userMapApproved[uid].timesheets,
            true,
            adminApprovedViewContainer
          );
        });
        actionTd.appendChild(vBtn);
        tr.appendChild(actionTd);
        newTbody.appendChild(tr);
      });
    }
  }
  


























  
  /*************************
   * ADMIN: show user timesheets
   *************************/
  function showAdminUserTimesheets(uid, userName, timesheets, isApprovedSection, containerEl) {
    containerEl.innerHTML = "";
    containerEl.classList.remove("hidden");
  
    timesheets.sort((a, b) => b.startDate.localeCompare(a.startDate));
  
    timesheets.forEach(ts => {
      const card = document.createElement("div");
      card.classList.add("timesheet-item");

      /* ---------- header ---------- */
      const header = document.createElement("div");
      header.classList.add("timesheet-item-header");

      const contested = ts.contested === true && !isApprovedSection;
      header.innerHTML =
        (contested ? '<span style="color:red">*</span> ' : "") +
        `${userName}<br>(${ts.startDate} - ${ts.endDate})`;

      // If this is a contested pending timesheet and has a comment, show it above the table
      let adminCommentBox = null;
      if (contested && ts.adminEditComment) {
        adminCommentBox = document.createElement("div");
        adminCommentBox.style.background = "#f7f7f7";
        adminCommentBox.style.border = "1px solid #bbb";
        adminCommentBox.style.borderRadius = "8px";
        adminCommentBox.style.padding = "1rem";
        adminCommentBox.style.margin = "1rem 0";
        adminCommentBox.style.fontSize = "1.1rem";
        adminCommentBox.style.color = "#333";
        adminCommentBox.textContent = ts.adminEditComment;
      }
      /* ---------- details wrapper ---------- */
      const details = document.createElement("div");
      details.classList.add("timesheet-details", "hidden", isApprovedSection ? "admin-view" : "admin-view");
  
      /* ---------------------------------------------------
         Everything below only runs for "Pending" timesheets.
         --------------------------------------------------- */
      let edited = false;          // track whether anything changed
      let editedEntries = JSON.parse(JSON.stringify(ts.entries));
  
      /* 1. Create the Approve / Contest button up front */
      const approveBtn = document.createElement("button");
      approveBtn.textContent = "Approve";

      // Add Print button for pending section
      const printBtn = document.createElement("button");
      printBtn.textContent = "Print";
      printBtn.onclick = () => printOrExportTimesheet(ts, true);

      // Add comment box (hidden by default)
      const commentBoxWrapper = document.createElement("div");
      commentBoxWrapper.style.display = "none";
      commentBoxWrapper.style.margin = "1rem 0";
      commentBoxWrapper.style.width = "100%";
      commentBoxWrapper.style.textAlign = "center";
      const commentBox = document.createElement("textarea");
      commentBox.rows = 4;
      commentBox.style.width = "90%";
      commentBox.style.maxWidth = "600px";
      commentBox.style.fontSize = "1.1rem";
      commentBox.style.padding = "0.5rem";
      commentBox.style.border = "1px solid #ccc";
      commentBox.style.borderRadius = "8px";
      commentBox.placeholder = "Enter timesheet edit comments here";
      commentBoxWrapper.appendChild(commentBox);

      // Show comment box if any edit is made
      function showCommentBoxIfEdited() {
        if (edited) {
          commentBoxWrapper.style.display = "block";
        }
      }

      function updateContestButton() {
        approveBtn.textContent = edited ? "Contest" : "Approve";
        showCommentBoxIfEdited();
      }
  
      /* 2. Helper that builds an editable cell */
        function makeEditableCell(val, type, cb) {
        const cell = document.createElement("td");
  
        const span = document.createElement("span");
          span.textContent = val;
        span.style.cursor = "pointer";
  
        span.ondblclick = () => {
            let input;
          if (type === "time") {
            input = document.createElement("input");
            input.type = "time";
            input.value = parseAmPmTo24Hr(val) || "";
          } else if (type === "text") {
            input = document.createElement("input");
            input.type = "text";
              input.value = val;
          } else if (type === "select") {
            input = document.createElement("select");
  
              const jobs = getCombinedJobs();
            const emptyOpt = document.createElement("option");
            emptyOpt.value = "";
            emptyOpt.textContent = "(Select a job)";
            input.appendChild(emptyOpt);
  
              jobs.forEach(j => {
              const opt = document.createElement("option");
                opt.value = j;
                opt.textContent = j;
                if (j === val) opt.selected = true;
                input.appendChild(opt);
              });
            }
  
          input.onblur = () => {
              let newVal = input.value;
            if (type === "time") newVal = newVal ? formatTime24ToAmPm(newVal) : "";
              span.textContent = newVal;
              cell.replaceChild(span, input);
  
              if (newVal !== val) {
                edited = true;
                cb(newVal);
              updateContestButton();   // flip button text right away
              }
            };
  
          input.onkeydown = ev => {
            if (ev.key === "Enter") input.blur();
            };
  
            cell.replaceChild(input, span);
            input.focus();
          };
  
          cell.appendChild(span);
          return cell;
        }
  
      /* ---------- build the table ---------- */
      const wrapper = document.createElement("div");
      wrapper.classList.add("table-wrapper");
  
      const table = document.createElement("table");
      table.style.tableLayout = "fixed";
      table.style.borderRadius = "20px";
      table.style.overflow = "hidden";
  
      const thead = document.createElement("thead");
      const thr = document.createElement("tr");
      ["Date","Start","End","Start","End","On Call Hours","Job","Comment","Total Hrs"]
        .forEach(txt => {
          const th = document.createElement("th");
          if (txt === 'On Call Hours') {
            th.classList.add('on-call-header');
            th.innerHTML = '<span>On Call Hours</span><br>';
            th.style.minWidth = '150px';
            th.style.width = '150px';
          } else {
        th.textContent = txt;
          }
        thr.appendChild(th);
      });
      thead.appendChild(thr);
      table.appendChild(thead);
  
      const tbody = document.createElement("tbody");
  
      ts.entries.forEach((e, idx) => {
        if (idx === 7) {
          const sr = document.createElement('tr');
          sr.classList.add('spacer-row');
          const sc = document.createElement('td');
          sc.colSpan = 9;
          sr.appendChild(sc);
          tbody.appendChild(sr);
        }
        const row = document.createElement("tr");
        const dObj = new Date(e.date + "T12:00:00");
        const dateHtml = `${dObj.toLocaleDateString('en-US', { weekday: 'short' })}<br>(${dObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })})`;
  
        const dCell = document.createElement('td');
        dCell.innerHTML = "<span" + styleNone(e.date) + ">" + dateHtml + "</span>";
        dCell.style.whiteSpace = 'normal';
  
        // Editable cells for admin (pending only)
        function makeEditableCell(val, type, cb) {
          const cell = document.createElement('td');
          let span = document.createElement('span');
          span.textContent = val;
          span.style.cursor = 'pointer';
          span.ondblclick = function() {
            let input;
            if (type === 'time') {
              input = document.createElement('input');
              input.type = 'time';
              input.value = parseAmPmTo24Hr(val) || '';
            } else if (type === 'text') {
              input = document.createElement('input');
              input.type = 'text';
              input.value = val;
            } else if (type === 'select') {
              input = document.createElement('select');
              const jobs = getCombinedJobs();
              jobs.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j;
                opt.textContent = j;
                if (j === val) opt.selected = true;
                input.appendChild(opt);
              });
              const emptyOpt = document.createElement('option');
              emptyOpt.value = '';
              emptyOpt.textContent = '(Select a job)';
              if (!val) emptyOpt.selected = true;
              input.insertBefore(emptyOpt, input.firstChild);
            }
            input.onblur = function() {
              let newVal = input.value;
              if (type === 'time') newVal = newVal ? formatTime24ToAmPm(newVal) : '';
              span.textContent = newVal;
              cell.replaceChild(span, input);
              if (newVal !== val) {
                edited = true;
                cb(newVal);
                updateContestButton();
              }
            };
            input.onkeydown = function(ev) {
              if (ev.key === 'Enter') input.blur();
            };
            cell.replaceChild(input, span);
            input.focus();
          };
          cell.appendChild(span);
          return cell;
        }
  
        // Start1
        const st1Cell = makeEditableCell(formatTime24ToAmPm(e.start1 || ' '), 'time', v => {
          console.log('[showAdminUserTimesheets] Start1 edited:', v);
          editedEntries[idx].start1 = parseAmPmTo24Hr(v);
          console.log('[showAdminUserTimesheets] Recalculating with:', {
            start1: editedEntries[idx].start1,
            end1: editedEntries[idx].end1,
            start2: editedEntries[idx].start2,
            end2: editedEntries[idx].end2
          });
          editedEntries[idx].totalHours = calculateTotalHours(editedEntries[idx].start1, editedEntries[idx].end1, editedEntries[idx].start2, editedEntries[idx].end2);
          console.log('[showAdminUserTimesheets] New total hours:', editedEntries[idx].totalHours);
        });
        // End1
        const et1Cell = makeEditableCell(formatTime24ToAmPm(e.end1 || ' '), 'time', v => {
          console.log('[showAdminUserTimesheets] End1 edited:', v);
          editedEntries[idx].end1 = parseAmPmTo24Hr(v);
          console.log('[showAdminUserTimesheets] Recalculating with:', {
            start1: editedEntries[idx].start1,
            end1: editedEntries[idx].end1,
            start2: editedEntries[idx].start2,
            end2: editedEntries[idx].end2
          });
          editedEntries[idx].totalHours = calculateTotalHours(editedEntries[idx].start1, editedEntries[idx].end1, editedEntries[idx].start2, editedEntries[idx].end2);
          console.log('[showAdminUserTimesheets] New total hours:', editedEntries[idx].totalHours);
        });
        // Start2
        const st2Cell = makeEditableCell(formatTime24ToAmPm(e.start2 || ' '), 'time', v => {
          console.log('[showAdminUserTimesheets] Start2 edited:', v);
          editedEntries[idx].start2 = parseAmPmTo24Hr(v);
          console.log('[showAdminUserTimesheets] Recalculating with:', {
            start1: editedEntries[idx].start1,
            end1: editedEntries[idx].end1,
            start2: editedEntries[idx].start2,
            end2: editedEntries[idx].end2
          });
          editedEntries[idx].totalHours = calculateTotalHours(editedEntries[idx].start1, editedEntries[idx].end1, editedEntries[idx].start2, editedEntries[idx].end2);
          console.log('[showAdminUserTimesheets] New total hours:', editedEntries[idx].totalHours);
        });
        // End2
        const et2Cell = makeEditableCell(formatTime24ToAmPm(e.end2 || ' '), 'time', v => {
          console.log('[showAdminUserTimesheets] End2 edited:', v);
          editedEntries[idx].end2 = parseAmPmTo24Hr(v);
          console.log('[showAdminUserTimesheets] Recalculating with:', {
            start1: editedEntries[idx].start1,
            end1: editedEntries[idx].end1,
            start2: editedEntries[idx].start2,
            end2: editedEntries[idx].end2
          });
          editedEntries[idx].totalHours = calculateTotalHours(editedEntries[idx].start1, editedEntries[idx].end1, editedEntries[idx].start2, editedEntries[idx].end2);
          console.log('[showAdminUserTimesheets] New total hours:', editedEntries[idx].totalHours);
        });
        // On Call Hours (display only)
        const onCallTd = document.createElement('td');
        onCallTd.style.textAlign = 'center';
        onCallTd.style.minWidth = '150px';
        onCallTd.style.width = '150px';
        if (Array.isArray(e.onCallSessions) && e.onCallSessions.length > 0) {
          e.onCallSessions.forEach(sess => {
            const sessDiv = document.createElement('div');
            sessDiv.textContent = `${formatTime24ToAmPm(sess.start)} - ${formatTime24ToAmPm(sess.end)}`;
            onCallTd.appendChild(sessDiv);
          });
        }
        // Job
        const jobCell = makeEditableCell(e.jobDescription || '', 'select', v => {
          editedEntries[idx].jobDescription = v;
        });
        // Comment
        const cCell = makeEditableCell(e.comment || '', 'text', v => {
          editedEntries[idx].comment = v;
        });
        // Total Hours
        console.log('[showAdminUserTimesheets] Entry for date:', e.date);
        console.log('[showAdminUserTimesheets] Entry values:', { start1: e.start1, end1: e.end1, start2: e.start2, end2: e.end2 });
        console.log('[showAdminUserTimesheets] Calling calculateTotalHours');
        let totalHrs = calculateTotalHours(e.start1, e.end1, e.start2, e.end2);
        if (Array.isArray(e.onCallSessions)) {
          totalHrs += calculateOnCallSessionsHours(e.onCallSessions);
        }
        console.log('[showAdminUserTimesheets] Final total hours:', totalHrs);
        const hrsCell = document.createElement('td');
        hrsCell.textContent = (isNaN(totalHrs) ? 0 : totalHrs).toFixed(2);
  
        row.appendChild(dCell);
        row.appendChild(st1Cell);
        row.appendChild(et1Cell);
        row.appendChild(st2Cell);
        row.appendChild(et2Cell);
        row.appendChild(onCallTd);
        row.appendChild(jobCell);
        row.appendChild(cCell);
        row.appendChild(hrsCell);
        tbody.appendChild(row);
      });
  
      table.appendChild(tbody);
      wrapper.appendChild(table);
      details.appendChild(wrapper);
  
      /* ---------- button strip ---------- */
      const btnGroup = document.createElement("div");
      btnGroup.classList.add("inline-button-group");
  
      const openBtn = document.createElement("button");
      openBtn.textContent = "Open";
      openBtn.onclick = () => {
        details.classList.toggle("hidden");
        openBtn.textContent = details.classList.contains("hidden") ? "Open" : "Close";
      };
      btnGroup.appendChild(openBtn);
  
      if (isApprovedSection) {
        const printBtnA = document.createElement("button");
        printBtnA.textContent = "Print";
        printBtnA.onclick = () => printOrExportTimesheet(ts, true);
        btnGroup.appendChild(printBtnA);
      } else {
        // Add Print button for pending section
        btnGroup.appendChild(printBtn);
        /* approve or contest */
        approveBtn.onclick = async () => {
          if (approveBtn.textContent === "Contest") {
            if (!commentBox.value.trim()) {
              commentBox.focus();
              commentBox.style.borderColor = "red";
              commentBox.placeholder = "Please enter a comment before contesting.";
              return;
            }
            await updateDoc(doc(db, "timesheets", ts.id), {
              entries: editedEntries,
              contested: true,
              adminEditComment: commentBox.value.trim()
            });
            // Send contest email to admin (not user)
            sendTimesheetContestedEmail({
              toEmail: "becky@alcowater.com",
              userName: ts.userName,
              startDate: ts.startDate,
              endDate: ts.endDate
            });
            alert(`email has been sent to ${"becky@alcowater.com"}`);
          } else {
            if (confirm("Approve this timesheet?")) {
              await updateDoc(doc(db, "timesheets", ts.id), {
                approved: true,
                contested: false,
                adminEditComment: deleteField()
              });
            }
          }
          loadAdminData(); // refresh list
        };
        btnGroup.appendChild(approveBtn);
      }

      /* assemble card */
      card.appendChild(header);
      if (adminCommentBox) card.appendChild(adminCommentBox);
      card.appendChild(details);
      // Insert comment box above buttons for pending section
      if (!isApprovedSection) card.appendChild(commentBoxWrapper);
      card.appendChild(btnGroup);
      containerEl.appendChild(card);
    });
  
    /* back button */
    const back = document.createElement("button");
    back.textContent = "Back";
    back.style.display = "block";
    back.style.margin = "1rem auto 0 auto";
    back.onclick = () => {
      containerEl.classList.add("hidden");
      containerEl.innerHTML = "";
      adminLogoutBtn.classList.remove("hidden");
      if (isApprovedSection) {
        adminApprovedWrapper.classList.remove("hidden");
      } else {
        adminUsersWrapper.classList.remove("hidden");
      }
    };
    containerEl.appendChild(back);
  }
  
  
  /*************************
   * Print or Export PDF
   *************************/
/*************************
   * Print or Export PDF
   *************************/
  function printOrExportTimesheet(tsData, fromAdmin = false) {
    const popup = window.open('', '_blank', 'width=800,height=600');
    if (!popup) return;
  
    // We load Great Vibes for fancy cursive:
    const googleFontsLink = `
    <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet">
    `;
  
    const userName = tsData.userName;
    const style = `
    <style>
      @page {
        size: Letter;
        margin: 0.5in;
      }
      @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap');
      body {
        font-family: Arial, sans-serif; 
        margin: 20px;
      }
      h1, h2 {
        text-align: center; 
        margin: 0;
      }
      table {
        border-collapse: collapse; 
        width: 100%; 
        margin-top: 1rem;
        table-layout: fixed;
        font-size: 0.65rem;
        border-radius: 20px;
        overflow: hidden;
      }
      th, td {
        border: 1px solid #ccc;
        padding: 0.2rem;
        text-align: center;
        vertical-align: middle;
        word-wrap: break-word;
        white-space: normal;
      }
      th {
        background-color: #4299e1;
        color: #fff;
        font-weight: 600;
      }
      .cursive-name {
        font-family: 'Great+Vibes', cursive;
        text-decoration: underline;
        font-size: 1.5rem;
      }
    </style>
    `;
  
    let html = `
    <h1>Alco Water Service</h1>
    <h2>${userName} - Timesheet</h2>
    <p style="text-align:center;">Pay Period: ${tsData.startDate} to ${tsData.endDate}</p>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Start</th>
          <th>End</th>
          <th>Start</th>
          <th>End</th>
          <th>On Call Hours</th>
          <th>Job</th>
          <th>Comment</th>
          <th>Total Hrs</th>
        </tr>
      </thead>
      <tbody>
    `;
  
    tsData.entries.forEach((e, idx) => {
      if (idx === 7) {
        html += `<tr><td colspan="9" style="border:none;"></td></tr>`;
      }
      const dObj = new Date(e.date + "T12:00:00");
      const wdShort = dObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dtShort = dObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      const dateHtml = `${wdShort}<br>(${dtShort})`;
  
      function maybeNone(v) {
        if (!v || v === "None" || v === "NaN") {
          return `<span style="color:white;"></span>`;
        }
        return v;
      }
      const st1 = maybeNone(formatTime24ToAmPm(e.start1 === "" ? "" : e.start1));
      const et1 = maybeNone(formatTime24ToAmPm(e.end1 === "" ? "" : e.end1));
      const st2 = maybeNone(formatTime24ToAmPm(e.start2 === "" ? "" : e.start2));
      const et2 = maybeNone(formatTime24ToAmPm(e.end2 === "" ? "" : e.end2));
      // On Call Hours cell
      let onCallHtml = '';
      if (Array.isArray(e.onCallSessions) && e.onCallSessions.length > 0) {
        onCallHtml = e.onCallSessions.map(sess => `${formatTime24ToAmPm(sess.start)} - ${formatTime24ToAmPm(sess.end)}`).join('<br>');
      }
      const job = maybeNone(e.jobDescription === "" ? "" : e.jobDescription);
      const cmt = maybeNone(e.comment === "" ? "" : e.comment);
      // Calculate total hours including on call
      console.log('[printOrExportTimesheet] Entry for date:', e.date);
      console.log('[printOrExportTimesheet] Entry values:', { start1: e.start1, end1: e.end1, start2: e.start2, end2: e.end2 });
      console.log('[printOrExportTimesheet] Calling calculateTotalHours');
      let totalHrs = calculateTotalHours(e.start1, e.end1, e.start2, e.end2);
      if (Array.isArray(e.onCallSessions)) {
        totalHrs += calculateOnCallSessionsHours(e.onCallSessions);
      }
      console.log('[printOrExportTimesheet] Final total hours:', totalHrs);
      const hrs = maybeNone((isNaN(totalHrs) ? 0 : totalHrs).toFixed(2));
  
      html += `
      <tr>
        <td>${dateHtml}</td>
        <td>${st1}</td>
        <td>${et1}</td>
        <td>${st2}</td>
        <td>${et2}</td>
        <td>${onCallHtml}</td>
        <td>${job}</td>
        <td>${cmt}</td>
        <td>${hrs}</td>
      </tr>`;
    });
  
    html += `
      </tbody>
    </table>
  
    <p style="margin-top:2rem;">
      I certify that I have worked the hours listed on the time card. 
      While on this assignment I have not had any work related injuries or illnesses 
      that I have not reported to Alco Water Service.
    </p>
    <p style="margin-top:1rem;">
      <input type="checkbox" checked disabled style="margin-right:5px;">
      I certify that I have received my mandated 30 minute lunch break along with two separate 10 minute breaks.
    </p>
    <p style="margin-top:2rem;">
      Signature: <span class="cursive-name">${userName}</span>
    </p>
    `;
  
    popup.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Print Timesheet</title>
      ${googleFontsLink}
      ${style}
    </head>
    <body>
    ${html}
    <script>
      setTimeout(() => {
        window.focus();
        window.print();
        window.close();
      }, 500);
    <\/script>
    </body>
    </html>
    `);
    popup.document.close();
  }
  
  /*************************
   * GEAR => open Easy Fill
   *************************/
  gearButton.addEventListener('click', () => {
    userDashboard.classList.add('hidden');
    easyfillSettingsContainer.style.display = 'block';
    populateEasyFillTable();
  });
  
  /*************************
   * Populate Easy Fill Table
   *************************/
  function populateEasyFillTable() {
    easyfillSettingsTbody.innerHTML = "";
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    dayNames.forEach(d => {
      const row = document.createElement('tr');
      const dayCell = document.createElement('td');
      dayCell.textContent = d;
  
      const st1Cell = document.createElement('td');
      st1Cell.classList.add('easyfill-time-cell');
      const end1Cell = document.createElement('td');
      end1Cell.classList.add('easyfill-time-cell');
      const st2Cell = document.createElement('td');
      st2Cell.classList.add('easyfill-time-cell');
      const end2Cell = document.createElement('td');
      end2Cell.classList.add('easyfill-time-cell');
      const jobCell = document.createElement('td');
      const cmtCell = document.createElement('td');
  
      const info = userEasyFillSettings[d] || {};
      st1Cell.textContent = formatTime24ToAmPm(info.start1 || "");
      end1Cell.textContent = formatTime24ToAmPm(info.end1 || "");
      st2Cell.textContent = formatTime24ToAmPm(info.start2 || "");
      end2Cell.textContent = formatTime24ToAmPm(info.end2 || "");
      jobCell.textContent = info.job || "";
      cmtCell.textContent = info.comment || "";
  
      row.appendChild(dayCell);
      row.appendChild(st1Cell);
      row.appendChild(end1Cell);
      row.appendChild(st2Cell);
      row.appendChild(end2Cell);
      row.appendChild(jobCell);
      row.appendChild(cmtCell);
  
      // Double-click to edit
      for (let j = 1; j < row.cells.length; j++) {
        row.cells[j].addEventListener('dblclick', () => {
          if (!editingEasyFill) {
            easyfillEditBtn.click();
          }
        });
      }
  
      easyfillSettingsTbody.appendChild(row);
    });
  }
  
  /*************************
   * EasyFill Edit / Save
   *************************/
  let editingEasyFill = false;
  easyfillEditBtn.addEventListener('click', async () => {
    if (!editingEasyFill) {
      editingEasyFill = true;
      easyfillEditBtn.textContent = "Save";
  
      for (let i = 0; i < easyfillSettingsTbody.rows.length; i++) {
        const row = easyfillSettingsTbody.rows[i];
        // Columns: Day, st1, e1, st2, e2, job, comment
        for (let c = 1; c <= 4; c++) {
          const cell = row.cells[c];
          const txt = cell.textContent.trim();
          cell.textContent = "";
          const inp = document.createElement('input');
          inp.type = 'time';
          const c24 = parseAmPmTo24Hr(txt);
          if (c24) inp.value = c24;
          cell.appendChild(inp);
        }
        // Job column
        {
          const cell = row.cells[5];
          const txt = cell.textContent.trim();
          cell.textContent = "";
          const sel = document.createElement('select');
  
          // Combine default + user custom jobs for EasyFill
          const defaultJobs = [
            "Meter Reader", "Pump Maintenance", "Customer Service", "Utilities Maintenance",
            "GIS/Mapping", "Water Operator", "Holiday", "Paid Time Off",
            "Hauling services", "After hours"
          ];
          const allJobs = [...defaultJobs, ...userCustomJobs];
          allJobs.sort((a, b) => a.localeCompare(b));
  
          // Empty option
          const eOpt = document.createElement('option');
          eOpt.value = "";
          eOpt.textContent = "(Select a job)";
          sel.appendChild(eOpt);
  
          allJobs.forEach(optVal => {
            const o = document.createElement('option');
            o.value = optVal;
            o.textContent = optVal;
            sel.appendChild(o);
          });
          // Preselect if exists
          for (let j = 0; j < sel.options.length; j++) {
            if (sel.options[j].value === txt) {
              sel.options[j].selected = true;
              break;
            }
          }
          cell.appendChild(sel);
        }
        // Comment column
        {
          const cell = row.cells[6];
          const txt = cell.textContent.trim();
          cell.textContent = "";
          const cIn = document.createElement('input');
          cIn.type = 'text';
          cIn.value = txt;
          cell.appendChild(cIn);
        }
      }
    } else {
      editingEasyFill = false;
      easyfillEditBtn.textContent = "Edit";
  
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      for (let i = 0; i < easyfillSettingsTbody.rows.length; i++) {
        const row = easyfillSettingsTbody.rows[i];
        const dName = dayNames[i];
        const st1In = row.cells[1].querySelector('input');
        const e1In = row.cells[2].querySelector('input');
        const st2In = row.cells[3].querySelector('input');
        const e2In = row.cells[4].querySelector('input');
        const jobSel = row.cells[5].querySelector('select');
        const cIn = row.cells[6].querySelector('input');
  
        const s1 = st1In.value.trim() || "";
        const e1 = e1In.value.trim() || "";
        const s2 = st2In.value.trim() || "";
        const e2 = e2In.value.trim() || "";
        const jv = jobSel.value.trim() || "";
        const cv = cIn.value.trim() || "";
  
        userEasyFillSettings[dName] = {
          start1: s1,
          end1: e1,
          start2: s2,
          end2: e2,
          job: jv,
          comment: cv
        };
      }
      await setDoc(doc(db, 'easyfillsettings', currentUser.uid), userEasyFillSettings);
      populateEasyFillTable();
    }
  });
  
  easyfillBackBtn.addEventListener('click', () => {
    easyfillSettingsContainer.style.display = 'none';
    userDashboard.classList.remove('hidden');
  });
  
  /*************************
   * Done: init
   *************************/
  showUserLogin();

// ---- EMAILJS: Send notification when a timesheet is contested ----
function sendTimesheetContestedEmail({
  toEmail,
  userName,
  startDate,
  endDate
}) {
  if (typeof emailjs === 'undefined') return;
  emailjs.send("service_09kopw4", "template_ig6528q", {
    email: toEmail,
    user: userName,
    start_date: startDate,
    end_date: endDate
  })
  .then(function(response) {
    console.log("Contest email sent!", response.status, response.text);
  }, function(error) {
    console.error("Contest email failed:", error);
  });
}

// Add context menu for deleting all timesheets for a user in admin tables
function addAdminUserContextMenu() {
  // Remove any existing context menu
  function removeMenu() {
    const existing = document.getElementById('admin-user-context-menu');
    if (existing) existing.remove();
    document.removeEventListener('click', removeMenu);
    document.removeEventListener('scroll', removeMenu, true);
  }

  // Attach to both pending and approved tables
  ['admin-users-tbody', 'admin-approved-tbody'].forEach(tbodyId => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const nameTd = tr.querySelector('td');
      if (!nameTd) return;
      nameTd.oncontextmenu = async (e) => {
        e.preventDefault();
        removeMenu();
        const menu = document.createElement('div');
        menu.id = 'admin-user-context-menu';
        menu.style.position = 'fixed';
        menu.style.top = e.clientY + 'px';
        menu.style.left = e.clientX + 'px';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #888';
        menu.style.borderRadius = '6px';
        menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        menu.style.zIndex = 10000;
        menu.style.padding = '0.5rem 0';
        menu.style.minWidth = '120px';
        menu.innerHTML = '<div style="padding:8px 16px;cursor:pointer;">Delete All Timesheets</div>';
        menu.firstChild.onmouseover = () => menu.firstChild.style.background = '#eee';
        menu.firstChild.onmouseout = () => menu.firstChild.style.background = '';
        menu.firstChild.onclick = async () => {
          removeMenu();
          if (!confirm('Delete ALL timesheets for this user? This cannot be undone.')) return;
          // Get userId from tr's data-uid attribute
          const trEl = e.target.closest('tr');
          const userId = trEl ? trEl.getAttribute('data-uid') : null;
          if (!userId) {
            alert('Could not determine user ID for deletion.');
            return;
          }
          // Delete all timesheets for this user
          const q = await getDocs(query(collection(db, 'timesheets'), where('userId', '==', userId)));
          const batch = [];
          q.forEach(docSnap => {
            batch.push(updateDoc(doc(db, 'timesheets', docSnap.id), { adminDeleted: true }));
          });
          await Promise.all(batch);
          alert('All timesheets for this user have been deleted.');
          loadAdminData();
        };
        document.body.appendChild(menu);
        setTimeout(() => {
          document.addEventListener('click', removeMenu);
          document.addEventListener('scroll', removeMenu, true);
        }, 0);
      };
    });
  });
}

// Patch loadAdminData to build a name->userId map for context menu
const _origLoadAdminData = loadAdminData;
loadAdminData = async function() {
  await _origLoadAdminData.apply(this, arguments);
  // Build a map of userName -> userId for context menu
  window._adminUserIdMap = {};
  // Pending
  const pendingTable = document.getElementById('admin-users-tbody');
  if (pendingTable) {
    Array.from(pendingTable.querySelectorAll('tr')).forEach(tr => {
      const nameTd = tr.querySelector('td');
      const userName = nameTd ? nameTd.textContent.replace(/^[*\s]+/, '').trim() : '';
      const actionBtn = tr.querySelector('button');
      if (actionBtn && actionBtn.onclick) {
        // Try to extract userId from the onclick closure (hacky, but works for now)
        // Instead, patch showAdminUserTimesheets to add data-uid attr to tr
      }
    });
  }
  // Approved
  const approvedTable = document.getElementById('admin-approved-tbody');
  if (approvedTable) {
    Array.from(approvedTable.querySelectorAll('tr')).forEach(tr => {
      const nameTd = tr.querySelector('td');
      const userName = nameTd ? nameTd.textContent.replace(/^[*\s]+/, '').trim() : '';
    });
  }
  addAdminUserContextMenu();
};
// Patch admin table row creation to add data-uid attribute
// In loadAdminData, when building each tr for pending/approved, add tr.setAttribute('data-uid', uid);
