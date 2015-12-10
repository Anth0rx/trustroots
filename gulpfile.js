'use strict';

/**
 * Module dependencies.
 */
var _ = require('lodash'),
  defaultAssets = require('./config/assets/default'),
  testAssets = require('./config/assets/test'),
  gulp = require('gulp'),
  gulpLoadPlugins = require('gulp-load-plugins'),
  runSequence = require('run-sequence'),
  plugins = gulpLoadPlugins({
    rename: {
      'gulp-angular-templatecache': 'templateCache'
    }
  }),
  path = require('path'),
  endOfLine = require('os').EOL,
  del = require('del'),
  fs = require('fs');

// Set NODE_ENV to 'test'
gulp.task('env:test', function () {
  process.env.NODE_ENV = 'test';
});

// Set NODE_ENV to 'development'
gulp.task('env:dev', function () {
  process.env.NODE_ENV = 'development';
});

// Set NODE_ENV to 'production'
gulp.task('env:prod', function () {
  process.env.NODE_ENV = 'production';
});

// Make sure local config file exists
gulp.task('copyConfig', function (done) {
  if(!fs.existsSync('config/env/local.js') ) {
    return gulp
      .src('config/env/local.sample.js')
      .pipe(plugins.rename('local.js'))
      .pipe(gulp.dest('config/env/'));
  }
  else {
    done();
  }
});

// Nodemon task
gulp.task('nodemon', function () {
  return plugins.nodemon({
    script: 'server.js',
    nodeArgs: ['--debug'],
    ext: 'js,html',
    watch: _.union(defaultAssets.server.views, defaultAssets.server.allJS, defaultAssets.server.config)
  });
});

// Watch files for changes
gulp.task('watch', function () {
  // Start livereload
  plugins.livereload.listen();

  // Add watch rules
  gulp.watch(defaultAssets.server.views).on('change', plugins.livereload.changed);
  gulp.watch(defaultAssets.server.allJS, ['jshint']).on('change', plugins.livereload.changed);
  gulp.watch(defaultAssets.server.fontelloConfig, ['fontello']).on('change', plugins.livereload.changed);
  gulp.watch(defaultAssets.client.js, ['jshint', 'uglify']).on('change', plugins.livereload.changed);
  gulp.watch(defaultAssets.client.less, ['less']).on('change', plugins.livereload.changed);

  if (process.env.NODE_ENV === 'production') {
    gulp.watch(defaultAssets.server.gulpConfig, ['templatecache', 'jshint']);
    gulp.watch(defaultAssets.client.views, ['templatecache', 'jshint']).on('change', plugins.livereload.changed);
  } else {
    gulp.watch(defaultAssets.server.gulpConfig, ['jshint']);
    gulp.watch(defaultAssets.client.views).on('change', plugins.livereload.changed);
  }
});

// JS linting task
gulp.task('jshint', function () {
  var assets = _.union(
    defaultAssets.server.gulpConfig,
    defaultAssets.server.allJS,
    defaultAssets.client.js,
    testAssets.tests.server,
    testAssets.tests.client,
    testAssets.tests.e2e
  );

  return gulp.src(assets)
    .pipe(plugins.jshint())
    .pipe(plugins.jshint.reporter('default'))
    .pipe(plugins.jshint.reporter('fail'));
});

// JS minifying task
gulp.task('uglify', function () {
  var assets = _.union(
    defaultAssets.client.js,
    defaultAssets.client.templates
  );

  return gulp.src(assets)
    .pipe(plugins.ngAnnotate())
    .pipe(plugins.uglify({
      mangle: false
    }))
    .pipe(plugins.concat('application.min.js'))
    .pipe(gulp.dest('public/dist'));
});

// CSS minifying task
gulp.task('cssmin', function () {
  return gulp.src('application.css')
    .pipe(plugins.cssmin())
    .pipe(plugins.concat('application.min.css'))
    .pipe(gulp.dest('public/dist'));
});

// Less task
gulp.task('less', function () {

  del([
    'public/dist/*.css'
  ]);

  return gulp.src(defaultAssets.client.lessSrc)
    //.pipe(plugins.plumber())
    .pipe(plugins.less({
      //compress: (process.env.NODE_ENV === 'production')
    }))
    .pipe(plugins.concat('application.css'))
    .pipe(plugins.autoprefixer())
    .pipe(gulp.dest('public/dist'));

  /*
  return gulp.src(defaultAssets.client.less)
    .pipe(plugins.less())
    .pipe(plugins.autoprefixer())
    .pipe(plugins.rename(function (file) {
      file.dirname = file.dirname.replace(path.sep + 'less', path.sep + 'css');
    }))
    .pipe(gulp.dest('./modules/'));
    */
});

// Angular template cache task
gulp.task('templatecache', function () {
  var re = new RegExp('\\' + path.sep + 'client\\' + path.sep, 'g');

  return gulp.src(defaultAssets.client.views)
    .pipe(plugins.templateCache('templates.js', {
      root: 'modules/',
      module: 'core',
      templateHeader: '(function () {' + endOfLine + '	\'use strict\';' + endOfLine + endOfLine + '	angular' + endOfLine + '		.module(\'<%= module %>\'<%= standalone %>)' + endOfLine + '		.run(templates);' + endOfLine + endOfLine + '	templates.$inject = [\'$templateCache\'];' + endOfLine + endOfLine + '	function templates($templateCache) {' + endOfLine,
      templateBody: '		$templateCache.put(\'<%= url %>\', \'<%= contents %>\');',
      templateFooter: '	}' + endOfLine + '})();' + endOfLine,
      transformUrl: function (url) {
        return url.replace(re, path.sep);
      }
    }))
    .pipe(gulp.dest('public/dist'));
});

// Generate font icon files from Fontello.com
gulp.task('fontello', function(done) {
  return gulp.src(defaultAssets.server.fontelloConfig)
    .pipe(plugins.fontello( {
      font:       'font', // Destination dir for Fonts and Glyphs
      css:        'css',  // Destination dir for CSS Styles,
      assetsOnly: true    // extract from ZipFile only CSS Styles and Fonts exclude config.json, LICENSE.txt, README.txt and demo.html
    }))
    .pipe(plugins.print())
    .pipe(gulp.dest('public/lib/fontello'));
});

// Generate Swagger documentation
gulp.task('docs', plugins.shell.task([
  'mkdir -p ./tmp',
  'rm -fr ./tmp/swagger-ui-master',
  'wget -nv -O ./tmp/swagger-ui.zip  https://github.com/swagger-api/swagger-ui/archive/master.zip',
  'unzip -q ./tmp/swagger-ui.zip -d ./tmp',
  'rm -fr ./public/developers/api',
  'mkdir -p ./public/developers/api',
  'mv ./tmp/swagger-ui-master/dist/* ./public/developers/api',
  'sed -i "" "s!http://petstore\.swagger\.io/v2!/developers!g" ./public/developers/api/index.html',
  'sed -i "" "s!url: url,!url: url, validatorUrl:null,!g" ./public/developers/api/index.html',
  'rm -fr ./tmp/swagger-ui-master'
]));

// Generate font icon files from Fontello.com
gulp.task('fontello-cli', plugins.shell.task('fontello-cli install --config ./fontello.conf.json --css ./public/lib/fontello/css --font ./public/lib/fontello/fonts'));

// Run Selenium tasks
gulp.task('selenium', plugins.shell.task('python ./scripts/selenium/test.py'));

// Mocha tests task
gulp.task('mocha', function (done) {
  // Open mongoose connections
  var mongoose = require('./config/lib/mongoose.js');
  var error;

  // Connect mongoose
  mongoose.connect(function () {
    // Run the tests
    gulp.src(testAssets.tests.server)
      .pipe(plugins.mocha({
        reporter: 'spec',
        timeout: 10000
      }))
      .on('error', function (err) {
        // If an error occurs, save it
        error = err;
      })
      .on('end', function () {
        // When the tests are done, disconnect mongoose and pass the error state back to gulp
        mongoose.disconnect(function () {
          done(error);
        });
      });
  });

});

// Karma test runner task
gulp.task('karma', function (done) {
  return gulp.src([])
    .pipe(plugins.karma({
      configFile: 'karma.conf.js',
      action: 'run',
      singleRun: true
    }));
});

// Selenium standalone WebDriver update task
gulp.task('webdriver-update', plugins.protractor.webdriver_update);

// Protractor test runner task
gulp.task('protractor', function () {
  gulp.src([])
    .pipe(plugins.protractor.protractor({
      configFile: 'protractor.conf.js'
    }))
    .on('error', function (e) {
      throw e;
    });
});

// Lint JavaScript files
gulp.task('lint', function (done) {
  runSequence('jshint', done);
});

// Download fontello icon files, lint project files and minify them into production css and js
gulp.task('build', function (done) {
  runSequence('env:dev', 'fontello', 'lint', ['uglify', 'less', 'cssmin'], done);
});

// Run the project tests
/*
gulp.task('test', function (done) {
  runSequence('env:test', ['karma', 'mocha'], done);
});

gulp.task('test:server', function (done) {
  runSequence('env:test', ['mocha'], done);
});

gulp.task('test:client', function (done) {
  runSequence('env:test', ['karma'], done);
});
*/

// Run the project in development mode
gulp.task('default', function (done) {
  runSequence('env:dev', 'copyConfig', 'lint', ['nodemon', 'watch'], done);
});

// Run the project in debug mode
gulp.task('debug', function (done) {
  runSequence('env:dev', 'copyConfig', 'lint', ['nodemon', 'watch'], done);
});

// Run the project in production mode
gulp.task('prod', function (done) {
  runSequence('copyConfig', 'templatecache', 'build', 'env:prod', 'lint', ['nodemon', 'watch'], done);
});