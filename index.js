require('gopd'); console.log('gopd required successfully');

import express from 'express';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, update, get, orderByChild, query, equalTo, remove } from 'firebase/database';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  validatePassword
} from 'firebase/auth';
import favicon from 'serve-favicon';

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
app.use(favicon('public/assets/favicon.ico'));

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
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
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
  if (postDate.getDate() == now.getDate()) {
    result.datetime = `Today at ${time}`;
  } else if (postDate.getDate() == yesterday.getDate()) {
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
  } else if (diffInDays < 7) {
    result.formattedTimestamp = `${diffInDays}d`;
  } else if (diffInDays <= 28) {
    result.formattedTimestamp = `${Math.round(diffInDays / 7)}w`;
  } else {
    result.formattedTimestamp = `${month} ${day}, ${year}`;
  }
  return result;
}

// Routes
// GET Home Route - displays the home page
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
      const postSnapshot = await get(ref(db, `posts/${key}`));
      const post = postSnapshot.val() || {};
      let userHasReacted = false;
      if (auth.currentUser != null) {
        userHasReacted = post.reactions && post.reactions.hasOwnProperty(auth.currentUser.uid);
      } 
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
        reactions: value.reactions || [],
        comments: value.comments || [],
        reacted: userHasReacted,
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
// GET Login Route - displays the login page
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
// POST Login Route - retrieves and handles the login credentials
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
// GET Signup Route - displays the signup page
app.get('/signup', (req, res) => {
  res.render('signup.ejs', {
    errorMessage: null,
    firstName: null,
    lastName: null,
    email: null,
    redirectURL: req.query.redirectURL,
  });
});
// POST Signup Route - retrieves and handles the signup authentication details
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
    res.redirect(redirectURL || '/');
  } catch (error) {
    res.render('signup', {
      errorMessage: error,
      ...data,
      redirectURL,
    })
  }
});
// GET Logout Route - logs the user out
app.get('/signout', (req, res) => {
  signOut(auth).then(() => {
    res.redirect('/');
  }).catch((error) => {
    res.status(500).send(error);
  });
});
// GET User Profile Route - displays the user profile
app.get('/user/:id', [getUser], async (req, res, next) => {
  const id = req.params.id;
  const snapshot = await get(ref(db, `profiles/${id}`));
  if (snapshot.exists()) {
    const profile = snapshot.val();
    const postsSnapshot = await get(query(ref(db, `posts`), orderByChild('accountID'), equalTo(id)));
    let posts = [];
    if (postsSnapshot.exists()) {
      posts = Object.entries(postsSnapshot.val()).map(
        ([key, value]) => {
          let userHasReacted = false;
          if (auth.currentUser != null) {
            userHasReacted = value.reactions && value.reactions.hasOwnProperty(auth.currentUser.uid);
          } 
          return {
            ...value,
            accountName: profile.name,
            formattedTimestamp: formatDate(value.timestamp).formattedTimestamp,
            reactions: value.reactions || [],
            reacted: userHasReacted,
            comments: value.comments || [],
            id: key,
          }
        }
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
// GET Create Post Route - displays the create post page
app.get('/create', [getUser], (req, res) => {
  res.render('create.ejs', {
    ...res.locals.user,
    post: null,
  });
});
// POST Create Post Route - retrieves and handles the posting
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
// GET View Post Route - displays the given post and comments
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
// POST View Post Route - retrieves and handles the posting of comments
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
// DELETE View Post Route - handles the deletion of posts
app.delete('/post/:id/delete', async (req, res) => {
  const id = req.params.id;
  try {
    await remove(ref(db, `posts/${id}`));
    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});
// GET Edit Post Route - displays the edit post page
app.get('/post/:id/edit', [getUser], async (req, res, next) => {
  const id = req.params.id;
  if (isAuthenticated) {
    const postSnapshot = await get(ref(db, `posts/${id}`));
    if (postSnapshot.exists()) {
      const post = postSnapshot.val();
      if (post.accountID === auth.currentUser.uid) {
        const reactions = post.reactions || [];
        res.render('create.ejs', {
          ...res.locals.user,
          post,
          reactions,
          postID: id,
        });
        return;
      }
    }
  }
  next();
});
// POST Edit Post Route - retrieves and handles the editing of posts
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
// POST Reaction Route - retrieves and handles the reactions
app.post('/post/:id/react', [getUser], async (req, res) => {
  const id = req.params.id;
  const userID = auth.currentUser.uid;
  const data = {
    [userID]: true,
  }
  try {
    const postSnapshot = await get(ref(db, `posts/${id}`));
    if (postSnapshot.exists()) {
      const post = postSnapshot.val();
      const reactions = post.reactions || {};
      if (reactions[userID]) {
        const userReactionRef = ref(db, `posts/${id}/reactions/${userID}`);
        await remove(userReactionRef);
      } else {
        await update(ref(db,`posts/${id}/reactions`), {
          ...data,
        });
      }
      // Fetch the updated post to get the latest reactions count
      const updatedPostSnapshot = await get(ref(db, `posts/${id}`));
      const updatedPost = updatedPostSnapshot.val() || {};
      const updatedReactionCount = Object.keys(updatedPost.reactions || {}).length;
      // Determine if the user has reacted after the update/removal
      const userHasReacted = updatedPost.reactions && updatedPost.reactions.hasOwnProperty(userID);
      res.json({ success: true, reactionCount: updatedReactionCount, reacted: userHasReacted });
    } else {
      res.status(404).json({ success: false, message: 'Post not found' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Server starts
app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});

// Handle 404 (page not found) error
app.use((req, res) => {
  res.status(404).render('404.ejs');
});