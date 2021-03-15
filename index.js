const fs = require('fs')
const express = require('express')
const bodyParser = require("body-parser");
const cors = require('cors')
const fetch = require('node-fetch')

const server = express()
const fileEncoding = 'utf-8'
const tournamentDirectory = './tournamentFiles'

server.use(cors())
server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());

server.get('/', async (req, res) => {
  let stringResult = ''
  const readableStream = await fetch('https://lichess.org/api/user/figurlix/tournament/created')
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
    const tournamentIds = jsonResult.map(t => t.id)

    for (id of tournamentIds) {
      const path = `${tournamentDirectory}/${id}.json`

      // Write to file if not exists
      if (!fs.existsSync(path)) {
        const tournamentDetails = await fetch('https://lichess.org/api/tournament/' + id).then(resp => resp.json())
        // TODO also fetch performance
        // const tournamentResults = await fetch('https://lichess.org/api/tournament/' + id + '/results').then(resp => resp.json())
        const tournamentDetailsString = JSON.stringify({
          ...tournamentDetails,
          // results: tournamentResults
        });
        fs.writeFileSync(path, tournamentDetailsString, fileEncoding);
      }
    }

    const files = fs.readdirSync(tournamentDirectory);
    for (file of files) {
      const filePath = `${tournamentDirectory}/${file}`
      const fileContent = fs.readFileSync(filePath, fileEncoding)
      const fileJson = JSON.parse(fileContent);

      const elemIndex = jsonResult.findIndex(j => j.id === fileJson.id)
      jsonResult[elemIndex] = {
        ...jsonResult[elemIndex],
        ...fileJson,
      }
    }

    res.send(jsonResult)
  });
})

server.listen(3006, (err) => {
  if (err) throw err
  console.log('> Ready on http://localhost:3006')
})
