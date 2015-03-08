var React = require('react');
var Router = require('react-router');
var DefaultRoute = Router.DefaultRoute;
var Route = Router.Route;
var NotFoundRoute = Router.NotFoundRoute;

var App = require('./app');

var Home = require('./pages/home');
var Routes = require('./pages/routes/index');
var Route = require('./pages/routes/route');

module.exports = (
  <Route handler={App}>
    <DefaultRoute name="home" handler={Home} />
    <Route name="routes" path="/routes" handler={Routes} />
    <Route name="route" path="/route/:key" handler={Route} />
  </Route>
);
