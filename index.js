import express from 'express';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, update, get, orderByChild, query, equalTo } from 'firebase/database';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  validatePassword
} from 'firebase/auth';

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

// Middleware for getting the current user
const getUser = async(req, res, next) => {
  if ((
      req.path == '/' ||
      req.path.startsWith('/post/') ||
      req.path.startsWith('/user/')
    ) && !isAuthenticated) {
    res.locals.user = {
      isAuthenticated: false,
      firstName: null,
      lastName: null,
      id: null,
    }
  } else if (!isAuthenticated) {
    res.redirect('/login');
    return;
  } else {
    const id = auth.currentUser.uid;
    try {
      const snapshot = await get(ref(db, `profiles/${id}`));
      if (snapshot.exists()) {
        const profile = snapshot.val();
        res.locals.user = {
          isAuthenticated: true,
          firstName: profile.firstName,
          lastName: profile.lastName,
          id,
        }
      }
    } catch (error) {
      console.log(`Error: ${error}`);
      res.redirect('/');
      return;
    }
  }
  next();
}

// Function to format the timestamp
function formatDate(timestamp) {
  let result = {
    formattedTimestamp: null,
    datetime: null,
  };
  const now = new Date();
  const postDate = new Date(parseInt(timestamp));
  const month = postDate.toLocaleString('default', { month: 'short' });
  const day = postDate.getDate();
  const year = postDate.getFullYear();
  const time = postDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: 'numeric', hour12: true,
    timeZone: 'Asia/Manila',
  });
  const diffInSeconds = Math.round((now - postDate) / 1000);
  const diffInMinutes = Math.round(diffInSeconds / 60);
  const diffInHours = Math.round(diffInMinutes / 60);
  const diffInDays = Math.round(diffInHours / 24);
  if (diffInDays == 0) {
    result.datetime = `Today at ${time}`;
  } else if (diffInDays == 1) {
    result.datetime = `Yesterday at ${time}`;
  } else {
    result.datetime = `${month} ${day}, ${year} at ${time}`;
  }
  if (diffInDays === 0) {
    if (diffInHours > 0) {
      result.formattedTimestamp = `${diffInHours}h`;
    } else if (diffInMinutes > 0) {
      result.formattedTimestamp = `${diffInMinutes}m`;
    } else if (diffInSeconds <= 0) {
      result.formattedTimestamp = 'Now';
    } else{
      result.formattedTimestamp = `${diffInSeconds}s`;
    }
  } else if (diffInDays < 9) {
    result.formattedTimestamp = `${diffInDays}d`;
  } else {
    result.formattedTimestamp = `${month} ${day}, ${year}`;
  }
  return result;
}

// Routes
app.get('/', [getUser], async (req, res) => {
  // Get all posts
  const snapshot = await get(query(dbPostsRef, orderByChild('timestamp')));
  let posts = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    const promises = Object.entries(data).map(async ([key, value]) => {
      const accountIDSnapshot = await get(
        ref(db, `profiles/${value.accountID}/name`)
      );
      const accountName = accountIDSnapshot.val();
      const timestamp = formatDate(value.timestamp).formattedTimestamp;
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
    posts.sort((a, b) => b.timestamp - a.timestamp);
  }
  // Return the index page
  res.render('index.ejs', {
    posts,
    ...res.locals.user,
  });
});
app.get('/login', (req, res) => {
  if (isAuthenticated) {
    res.redirect('/');
  } else {
    res.render('login.ejs', {
      errorMessage: null,
      email: null,
      redirectURL: req.query.redirectURL,
    });
  }
});
app.post('/login', async (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;
  const redirectURL = req.body.redirectURL;
  await signInWithEmailAndPassword(auth, email, password).then((userCredential) => {
    res.redirect(redirectURL || '/');
  }).catch(
    (error) => {
      res.render('login',{
        errorMessage: error.message, 
        email: email,
        redirectURL,
      });
    }
  );
});
app.get('/signup', (req, res) => {
  res.render('signup.ejs', {
    errorMessage: null,
    firstName: null,
    lastName: null,
    email: null,
    redirectURL: req.query.redirectURL,
  });
});
app.post('/signup', async (req, res) => {
  const data = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
  }
  const redirectURL = req.body.redirectURL;
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
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, password);
    const accountID = userCredential.user.uid;
    await set(ref(db, `profiles/${accountID}`),{
      name: data.firstName + ' ' + data.lastName,
      email: userCredential.user.email,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    res.redirect(redirectURL || '/user/' + accountID);
  } catch (error) {
    res.render('signup', {
      errorMessage: error,
      ...data,
      redirectURL,
    })
  }
});
app.get('/signout', (req, res) => {
  signOut(auth).then(() => {
    res.redirect('/');
  }).catch((error) => {
    res.status(500).send(error);
  });
});
app.get('/user/:id', [getUser], async (req, res, next) => {
  const id = req.params.id;
  const snapshot = await get(ref(db, `profiles/${id}`));
  if (snapshot.exists()) {
    const profile = snapshot.val();
    const postsSnapshot = await get(query(ref(db, `posts`), orderByChild('accountID'), equalTo(id)));
    let posts = [];
    if (postsSnapshot.exists()) {
      posts = Object.entries(postsSnapshot.val()).map(
        ([key, value]) => ({
          ...value,
          accountName: profile.name,
          formattedTimestamp: formatDate(value.timestamp).formattedTimestamp,
          id: key,
        })
      );
      posts.sort((a, b) => b.timestamp - a.timestamp);
    }
    res.render('profile.ejs', {
      profile,
      ...res.locals.user,
      posts,
      errorMessage: null,
    });
    return;
  }
  next();
});
app.get('/create', [getUser], (req, res) => {
  res.render('create.ejs', {
    ...res.locals.user,
    post: null,
  });
});
app.post('/create', async (req, res) => {
  const data = {
    accountID: auth.currentUser.uid,
    caption: req.body.caption,
    imageURL: req.body.image,
  };
  try {
    await push(dbPostsRef, {
      ...data,
      timestamp: Date.now(),
    });
    res.redirect('/');
  } catch (error) {
    res.render('create', { errorMessage: error, ...data });
  }
});
app.get('/post/:id', [getUser], async (req, res, next) => {
  const postID = req.params.id;
  try {
    const snapshot = await get(ref(db, `posts/${postID}`));
    if (snapshot.exists()) {
      const post = snapshot.val();
      let title = post.caption.substring(0, 41);
      if (post.caption.length > 41) {
        title += '...';
      }
      title += ' | Scrunch';
      const accountSnapshot = await get(ref(db, `profiles/${post.accountID}`));
      const accountName = accountSnapshot.val().name;
      // const commentsSnapshot = await get(ref(db, `posts/${id}/comments`));
      const commentsSnapshot = await get(ref(db, `posts/${postID}/comments`), orderByChild('timestamp'));
      let comments = null;
      if (commentsSnapshot.exists()) {
        const promises = Object.entries(commentsSnapshot.val()).map(
          async ([key, value]) => {
            const commenterSnapshot = await get(ref(db, `profiles/${value.accountID}`));
            const commenterName = commenterSnapshot.val().name;
            return {
              ...value,
              accountName: commenterName,
              formattedTimestamp: formatDate(value.timestamp).formattedTimestamp,
            }
          });
        comments = await Promise.all(promises);
        comments.sort((a, b) => a.timestamp - b.timestamp);
      }
      res.render('view_post.ejs', {
        ...res.locals.user,
        post,
        postID,
        formattedTimestamp: formatDate(post.timestamp).datetime,
        accountName,
        title,
        comments,
      });
      return;
    }
  } catch (error) {
    console.log(error);
  }
  next();
});
app.post('/post/:id', async (req, res, next) => {
  const id = req.params.id;
  const data = {
    accountID: auth.currentUser.uid,
    content: req.body.comment,
    timestamp: Date.now(),
  };
  try {
    await push(ref(db,`posts/${id}/comments`), {
      ...data,
    });
    res.redirect('/post/' + id);
  } catch (error) {
    console.log(error);
  }
});
app.get('/post/:id/edit', [getUser], async (req, res, next) => {
  const id = req.params.id;
  if (isAuthenticated) {
    const postSnapshot = await get(ref(db, `posts/${id}`));
    if (postSnapshot.exists()) {
      const post = postSnapshot.val();
      if (post.accountID === auth.currentUser.uid) {
        res.render('create.ejs', {
          ...res.locals.user,
          post,
          postID: id,
        });
        return;
      }
    }
  }
  next();
});
app.post('/post/:id/edit', [getUser], async (req, res) => {
  const id = req.params.id;
  const data = {
    caption: req.body.caption,
    imageURL: req.body.image,
    editedOn: Date.now(),
  }
  try {
    await update(ref(db, `posts/${id}`), {
      ...data,
    });
    res.redirect('/post/' + id);
  } catch (error) {
    console.log(error);
    res.render('create.ejs', {
      errorMessage: error,
      post: data,
      postID: id,
      ...res.locals.user,
    });
  }
})

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});

// Handle 404 (page not found) error
app.use((req, res) => {
  res.status(404).render('404.ejs');
});