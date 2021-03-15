const fs = require('fs')
const express = require('express')
const bodyParser = require("body-parser");
const cors = require('cors')
const fetch = require('node-fetch')

const server = express()
const fileEncoding = 'utf-8'
const tournamentDirectory = './tournamentFiles'

const fetchStreamJson = url => new Promise(async (resolve, reject) => {
  let stringResult = ''
  const readableStream = await fetch(url)
    .then(response => response.body)

  readableStream.on('readable', () => {
    let chunk;
    while (null !== (chunk = readableStream.read())) {
      stringResult = stringResult + chunk.toString()
    }
  })

  readableStream.on('end', async () => {
    const stringArray = stringResult.split( '\n'); // split by new line
    stringArray.pop(); // remove last element
    const jsonResult = stringArray.map(a => JSON.parse(a)); // parse json

    resolve(jsonResult)
  })
})

server.use(cors())
server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());

server.get('/', async (req, res) => {
  let stringResult = ''
  const jsonResult = await fetchStreamJson('https://lichess.org/api/user/figurlix/tournament/created')
  const tournamentIds = jsonResult.map(t => t.id)

  for (id of tournamentIds) {
    const path = `${tournamentDirectory}/${id}.json`

    // Write to file if not exists
    if (!fs.existsSync(path)) {
      const tournamentDetails = await fetch('https://lichess.org/api/tournament/' + id).then(resp => resp.json())
      const tournamentResults = await fetchStreamJson('https://lichess.org/api/tournament/' + id + '/results')
      const tournamentDetailsString = JSON.stringify({
        ...tournamentDetails,
        results: tournamentResults
      });
      fs.writeFileSync(path, tournamentDetailsString, fileEncoding);
    }
  }

  const files = fs.readdirSync(tournamentDirectory);
  const response = []
  for (file of files) {
    const filePath = `${tournamentDirectory}/${file}`
    const fileContent = fs.readFileSync(filePath, fileEncoding)
    const fileJson = JSON.parse(fileContent);

    response.push(fileJson)
  }

  res.send(response)
})

server.listen(3006, (err) => {
  if (err) throw err
  console.log('> Ready on http://localhost:3006')
})
