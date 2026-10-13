require('dotenv').config();

const app = require('./app');
const port = Number(process.env.PORT || 3000);

app.listen(port, '0.0.0.0', () => {
  console.log(`PaperLogix listening on port ${port}`);
});
