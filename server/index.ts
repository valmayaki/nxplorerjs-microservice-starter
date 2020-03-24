import './common/env';
import Server from './common/server';
import { ApolloServer } from 'apollo-server-express';
const createSwaggerMiddleware = require('swagger-express-middleware');
import { configHystrix, configGraphQL } from './common/config';
import * as cluster from 'cluster';
import * as os from 'os';
import * as http from 'http';
import * as ProgressBar from 'progress';
import * as express from 'express';
import * as path from 'path';
import { swaggerify } from './common/config/';

// Single Node execution
// tslint:disable:no-console
const welcome = port =>
  console.log(
    `up and running in ${process.env.NODE_ENV ||
      'development'} @: ${os.hostname()} on port: ${port}`
  );

const setupServer = () => {
  // create server
  const bar = new ProgressBar('Server Startup [:bar] :percent :elapseds', {
    total: 6
  });
  bar.tick();
  const exApp = express();
  const swaggerFile = path.join(__dirname, './common/swagger/Api.yaml');
  createSwaggerMiddleware(swaggerFile, exApp, (err, middleware) => {
      swaggerify(exApp, middleware)
      const app = new Server(exApp).getServer().build();
      bar.tick();
      const apolloServer: ApolloServer = configGraphQL(app);
      bar.tick();
      // Create Server so that it can be reused for the
      // configuring the SubscriptionServer
      const ws = http.createServer(app);
      bar.tick();
      if (process.env.GRAPHQL_SUBSCRIPTIONS === 'true') {
        apolloServer.installSubscriptionHandlers(ws);
      }
      bar.tick();
      // console.log(apolloServer.subscriptionsPath);
      ws.listen(process.env.PORT, (err?: Error) => {
        if (err) {
          throw err;
        }

        if (process.env.STREAM_HYSTRIX === 'true') {
          // configure Hystrix Support
          configHystrix();
        }
        bar.tick();
        welcome(process.env.PORT);
      });
    }
)}

const setupCluster = () => {
  const numWorkers = require('os').cpus().length;

  console.log('Master cluster setting up ' + numWorkers + ' workers...');

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('online', worker => {
    console.log('Worker ' + worker.process.pid + ' is online');
  });

  cluster.on('exit', (worker, code, signal) => {
    console.log(
      'Worker ' +
        worker.process.pid +
        ' died with code: ' +
        code +
        ', and signal: ' +
        signal
    );
    console.log('Starting a new worker');
    cluster.fork();
  });
};

// Run in cluster mode
if (process.env.CLUSTER_MODE === 'true' && cluster.isMaster) {
  setupCluster();
} else {
  setupServer();
}
