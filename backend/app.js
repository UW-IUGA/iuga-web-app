import express from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import sessions from 'express-session';
import cors from 'cors';
import path from 'path';

import { models, connectToDatabase } from './models.js'
import { createSessionOptions } from './sessionConfig.js';
import apiv1Router from './routes/api/v1/apiv1.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sessionSecret = process.env.SESSION_SECRET?.trim();
if (!sessionSecret) {
    console.error('FATAL: SESSION_SECRET not set');
    process.exit(1);
}

await connectToDatabase();
const app = express();

// Readiness probe for the pipeline health gate. The listener only starts
// after the DB connects, so 200 implies the database is reachable.
app.get('/readyz', (req, res) => res.json({ status: 'ok' }));

if (!process.env.DEPLOY) {
    app.use(cors());
}

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Make sure that the client gets the latest version of resource
app.disable('etag');

app.use(express.static("../frontend/build"));

app.use(sessions(createSessionOptions(sessionSecret, process.env.DEPLOY_ENV)));


app.use((req, res, next) => {
    req.models = models;
    next();
})

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/events', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/resources', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/electionfaq', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

app.get('/contact', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

/*
Purpose: Serves the built SPA at /get-involved so React Router handles the route on direct navigation.
Authentication/Authorization Requirements: None

Expected Request Information:
- Parameters: N/A
- Queries: N/A
- Body: N/A

Expected Response Information:
- return index.html (200) or the sendFile error (500)
*/
app.get('/get-involved', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/admin/event-requests', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

app.get('/admin/events', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) {
      res.status(500).send(err)
    }
  })
})

app.get('/admin/repository', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/pipeline', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/pipeline/*', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/event-requests/review/*', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/events/review/*', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/charter', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/journal', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.get('/admin/contacts', function(req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
    if (err) res.status(500).send(err)
  })
})

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use('/api/v1', apiv1Router);

export default app;
