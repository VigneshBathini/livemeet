const cors = require('cors');

//this below to run frontend browser
const corsOptions = {
  origin: [
    "https://proctormeet.globalsparkteksolutions.com",
     'http://localhost:3099',
    'http://localhost:3000',
     'http://localhost:3001',
  ],
  methods: ['GET', 'POST','PUT','DELETE'],
  credentials: true,
};

module.exports = {
  middleware: cors(corsOptions),
  ...corsOptions,
};
