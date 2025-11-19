const express = require('express');
const app = express();
const port = 3000;

// Melayani semua file statis di folder project
app.use(express.static(__dirname));

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
