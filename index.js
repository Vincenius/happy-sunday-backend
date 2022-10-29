const fs = require('fs')
const express = require('express')
const bodyParser = require("body-parser");
const cors = require('cors')
const fetch = require('node-fetch')

const server = express()
const fileEncoding = 'utf-8'
const tournamentDirectory = './files/tournamentFiles'
const playerDirectory = './files/playerFiles'
const playerMetaDirectory = './files/playerMetaFiles'

const sleep = ms => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const getResult = score => {
  if (
    score === 2 ||
    score === 3 ||
    (typeof score === "object" && score[0] === 2 && score[1] === 2) ||
    (typeof score === "object" && score[0] === 3 && score[1] === 2) ||
    (typeof score === "object" && score[0] === 4 && score[1] === 3) ||
    (typeof score === "object" && score[0] === 5 && score[1] === 3)
  ) {
    return 'win'
  } else if (score === 1 ||
    (typeof score === "object" && score[0] === 1 && score[1] === 2) ||
    (typeof score === "object" && score[0] === 2 && score[1] === 3)
  ) {
    return 'draw'
  } else {
    return 'loss'
  }
}

const generateMatchData = (data, matchData = {}) => {
  for (let elem of data) {
    const { score, op } = elem
    const result = getResult(score)

    if (matchData[op.name]) { // exists
      matchData[op.name][result] = matchData[op.name][result] + 1
    } else { // does not exist
      matchData[op.name] = {
        win: result === 'win' ? 1 : 0,
        draw: result === 'draw' ? 1 : 0,
        loss: result === 'loss' ? 1 : 0
      }
    }
  }

  return matchData
}

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
  const jsonResult = await fetchStreamJson('https://lichess.org/api/user/figurlix/tournament/created')
  const tournamentIds = jsonResult.map(t => t.id).filter(id => id !== 'bHgniq4z') // filter first test tournament

  for (id of tournamentIds) {
    const path = `${tournamentDirectory}/${id}.json`

    // Write to file if not exists
    if (!fs.existsSync(path)) {
      let page = 1
      let uri = `https://lichess.org/api/tournament/${id}?page=${page}`
      const tournamentDetails = await fetch(uri).then(resp => resp.json())

      if (tournamentDetails.isFinished) {
        console.log('Fetching new tournament', id)
        const pages = Math.ceil(tournamentDetails.nbPlayers / 10)

        // fetch additional pages of players
        while (page < pages) {
          page++
          uri = `https://lichess.org/api/tournament/${id}?page=${page}`
          const additionalDetails = await fetch(uri).then(resp => resp.json())
          tournamentDetails.standing.players = [
            ...tournamentDetails.standing.players,
            ...additionalDetails.standing.players
          ]
        }
        // nbPlayers
        const tournamentResults = await fetchStreamJson('https://lichess.org/api/tournament/' + id + '/results')
        const tournamentDetailsString = JSON.stringify({
          ...tournamentDetails,
          results: tournamentResults
        });
        fs.writeFileSync(path, tournamentDetailsString, fileEncoding);

        fetch(`https://lichess.vincenius.com/generate/${id}`)
      }
    }
  }

  const files = fs.readdirSync(tournamentDirectory);
  const response = []
  for (file of files) {
    const filePath = `${tournamentDirectory}/${file}`
    const fileContent = fs.readFileSync(filePath, fileEncoding)
    const fileJson = JSON.parse(fileContent)

    response.push(fileJson)
  }

  res.send(response)
})

server.get('/generateAll', async (req, res) => {
  const files = fs.readdirSync(tournamentDirectory)
  const fileJsons = []

  for (file of files) {
    const filePath = `${tournamentDirectory}/${file}`
    const fileContent = fs.readFileSync(filePath, fileEncoding)
    const fileJson = JSON.parse(fileContent)
    fileJsons.push(fileJson)
    // const tournamentId = file.replace('.json','')
    // await fetch(`http://localhost:3006/generate/${tournamentId}`)
  }

  const sortedIds = fileJsons
    .sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt))
    .map(t => t.id)

  let i = 1;
  for (id of sortedIds) {
    console.log(`TOURNAMENT ${i} of ${sortedIds.length}`)
    await fetch(`http://localhost:3006/generate/${id}`)
    i++;
  }

  console.log('DONE', sortedIds)

  res.send({ done: true })
})

server.get('/generate/:tournamentId', async (req, res) => {
  const tournamentId = req.params.tournamentId

  const filePath = `${tournamentDirectory}/${tournamentId}.json`
  const fileContent = fs.readFileSync(filePath, fileEncoding)
  const fileJson = JSON.parse(fileContent)

  const players = fileJson.results.map(r => r.username.toLowerCase())

  for (let player of players) {
    const playerPathMeta = `${playerMetaDirectory}/${tournamentId}-${player}.json`

    if (!fs.existsSync(playerPathMeta)) {
      try {
        const uri = `https://lichess.org/tournament/${tournamentId}/player/${player}`
        const data = await fetch(uri).then(resp => resp.json())

        if (data.player.nb.game > 0) {
          console.log('generate', tournamentId, player)
          const playerPath = `${playerDirectory}/${player}.json`
          const playerData = fs.existsSync(playerPath)
            ? JSON.parse(fs.readFileSync(playerPath, fileEncoding)) // read from file
            : { // init empty
              berserk: [],
              score: [],
              games: [],
              performance: [],
              rank: [],
              blackWins: [],
              whiteWins: [],
              matches: {},
              blackGames: [],
              whiteGames: [],
              draws: []
            }

          const blackGames = data.pairings.reduce((acc, curr) => acc + (curr.color === 'black' ? 1 : 0), 0)
          const whiteGames = data.pairings.reduce((acc, curr) => acc + (curr.color === 'white' ? 1 : 0), 0)
          const draws = data.pairings.reduce((acc, curr) => getResult(curr.score) === 'draw' ? acc + 1 : acc, 0)

          playerData.berserk.push(data.player.nb.berserk || 0)
          playerData.score.push(data.player.score)
          playerData.games.push(data.player.nb.game)
          playerData.performance.push(data.player.performance)
          playerData.rank.push(data.player.rank)
          playerData.blackWins.push(
            data.pairings.reduce((acc, curr) => acc + (curr.color === 'black' && curr.win ? 1 : 0), 0)
          )
          playerData.whiteWins.push(
            data.pairings.reduce((acc, curr) => acc + (curr.color === 'white' && curr.win ? 1 : 0), 0)
          )
          playerData.matches = generateMatchData(data.pairings, playerData.matches)
          playerData.blackGames.push(blackGames)
          playerData.whiteGames.push(whiteGames)
          playerData.draws.push(draws)

          fs.writeFileSync(playerPathMeta, JSON.stringify(data), fileEncoding)
          fs.writeFileSync(playerPath, JSON.stringify(playerData), fileEncoding);
        } else {
          console.log('skip', tournamentId, player)
        }
        await sleep(10000) // wait to prevent rate limit
      } catch (e) {
        console.log('FAILED', playerPathMeta)
      }
    } else {
      console.log('ALREADY DONE, SKIP:', playerPathMeta)
    }
  }

  res.send({ done: true })
})

server.get('/player/:name', async (req, res) => {
  const player = req.params.name
  const filePath = `${playerDirectory}/${player}.json`
  const fileContent = fs.readFileSync(filePath, fileEncoding)
  const fileJson = JSON.parse(fileContent)

  res.send(fileJson)
})

server.listen(3006, (err) => {
  if (err) throw err
  console.log('> Ready on http://localhost:3006')
})
