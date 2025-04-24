import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.render('index.ejs');
});

const port = parseInt(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});