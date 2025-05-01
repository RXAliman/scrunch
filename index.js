import express from 'express';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, get } from 'firebase/database';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, validatePassword } from 'firebase/auth';

const app = express();
const PORT = 3000;

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: "scrunch-ac497.firebaseapp.com",
  databaseURL: process.env.DATABASE_URL,
  projectId: "scrunch-ac497",
  storageBucket: "scrunch-ac497.firebasestorage.app",
  messagingSenderId: "536808663237",
  appId: "1:536808663237:web:cf1033509c32fd43da28ac",
  measurementId: "G-9TTDH3EY2Q"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const dbPostsRef = ref(db, 'posts');
const dbProfilesRef = ref(db, 'profiles');

// Firebase authentication
const auth = getAuth();
var isAuthenticated;
onAuthStateChanged(auth, (user) => {
  if (user) {
    isAuthenticated = true;
  } else {
    isAuthenticated = false;
  }
});

// Middlewares
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Function to format the timestamp
function formatDate(timestamp) {
  const now = new Date();
  const postDate = new Date(parseInt(timestamp));
  const diffInSeconds = Math.round((now - postDate) / 1000);
  const diffInMinutes = Math.round(diffInSeconds / 60);
  const diffInHours = Math.round(diffInMinutes / 60);
  const diffInDays = Math.round(diffInHours / 24);
  if (diffInDays === 0) {
    if (diffInHours > 0) {
      return `${diffInHours}h`;
    } else if (diffInMinutes > 0) {
      return `${diffInMinutes}m`;
    } else {
      return `${diffInSeconds}s`;
    }
  } else if (diffInDays < 9) {
    return `${diffInDays}d`;
  } else {
    const month = postDate.toLocaleString('default', { month: 'short' });
    const day = postDate.getDate();
    const year = postDate.getFullYear();
    return `${month}. ${day}, ${year}`;
  }
}

// Routes
app.get('/', async (req, res) => {
  // Get all posts
  const snapshot = await get(dbPostsRef);
  let posts = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    const promises = Object.entries(data).map(async ([key, value]) => {
      const accountIDSnapshot = await get(
        ref(db, `profiles/${value.accountID}/name`)
      );
      const accountName = accountIDSnapshot.val();
      const timestamp = formatDate(value.timestamp);
      return {
        id: key,
        accountID: value.accountID,
        accountName: accountName,
        caption: value.caption,
        imageURL: value.imageURL,
        formattedTimestamp: timestamp,
        timestamp: value.timestamp,
      };
    });
    posts = await Promise.all(promises);
  }
  // Return the index page
  res.render('index.ejs', {
    posts,
    isAuthenticated,
  });
});
app.get('/login', (req, res) => {
  if (isAuthenticated) {
    res.redirect('/');
  } else {
    res.render('login.ejs', {
      errorMessage: null,
      email: null,
    });
  }
})
app.get('/signup', (req, res) => {
  res.render('signup.ejs', {
    errorMessage: null,
    firstName: null,
    lastName: null,
    email: null,
  });
});
app.get('/signout', (req, res) => {
  signOut(auth).then(() => {
    res.redirect('/');
  }).catch((error) => {
    res.status(500).send(error);
  });
});
app.get('/user/:id', async (req, res) => {
  const id = req.params.id;
  const snapshot = await get(ref(db, `profiles/${id}`));
  // Return 404 when page doesn't exists
  if (!snapshot.exists()) {
    res.status(404).render('404.ejs');
  }
  else {
    const profile = snapshot.val();
    res.render('profile.ejs', { profile, isAuthenticated });
  }
});
app.post('/login', async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  await signInWithEmailAndPassword(auth, email, password).catch(
    (error) => {
      res.render('login', { errorMessage: error.message, email: email });
      return;
    }
  );
  res.redirect('/');
})
app.post('/signup', async (req, res) => {
  const data = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
  }
  const password = req.body.password;
  const confirmPassword = req.body.confirmPassword;
  try {
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }
    const status = await validatePassword(auth, password);
    if (!status.meetsMinPasswordLength) {
      throw new Error("Your password must be at least 6 characters long");
    }
    if (!status.meetsMaxPasswordLength) {
      throw new Error("Your password must be within 45 characters long");
    }
    if (!status.containsLowercaseLetter) {
      throw new Error("Your password must contain an UPPER or lower case letter");
    }
    if (!status.containsUppercaseLetter) {
      throw new Error("Your password must contain an UPPER or lower case letter");
    }
    if (!status.containsNumericCharacter) {
      throw new Error("Your password must contain a number");
    }
    if (!status.containsNonAlphanumericCharacter) {
      throw new Error("Your password must a special character");
    }
    createUserWithEmailAndPassword(auth, data.email, password).then(
      (userCredential) => {
        const uid = userCredential.uid;
        push(dbProfilesRef, {
          key: uid,
          name: data.firstName + ' ' + data.lastName,
          email: userCredential.user.email,
          firstName: data.firstName,
          lastName: data.lastName,
        });
      }
    ).catch((error) => {
      res.render('signup', {
        errorMessage: error,
        ...data,
      });
      return;
    });
    res.redirect('/');
  } catch (error) {
    res.render('signup', { errorMessage: error, ...data })
  }
});

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});

// Handle 404 (page not found) error
app.use((req, res) => {
  res.status(404).render('404.ejs');
});