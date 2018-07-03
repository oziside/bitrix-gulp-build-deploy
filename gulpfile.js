const gulp          = require('gulp'); // Галп

//Build packages
const scss          = require('gulp-sass');
const concat        = require('gulp-concat');
const uglify        = require('gulp-uglify');
const cleancss      = require('gulp-clean-css');
const rename        = require('gulp-rename');
const autoprefixer  = require('gulp-autoprefixer');
const notify        = require("gulp-notify");

//Deploy packages
const argv          = require('yargs').argv;
const fs            = require('fs.extra');
const rsync         = require('gulp-rsync'); 
const gulpSSH       = require('gulp-ssh');
const chalk         = require( 'chalk' );

//Settings
const templateName  = "dsc" //Название вашей темы. НЕ должно быть пустым
const deployJSON    = {
    
    "dev": {
        "themeName": templateName, 
        //build data
        "appPath": "local/app/",
        "templatePath": "local/templates/",
        //Deploy data
        "destination": "/home/o/ozisidob/ozabaluev.ru/public_html/local/templates/",
        "root": "local/templates/"+ templateName,
        "releasesDirectory": "/home/o/ozisidob/ozabaluev.ru/releases/",
        //Server data
        "hostname": "ozisidob.beget.tech",
        "username": "ozisidob",
        "port": 22
    },
    "prod": {
        "themeName": templateName,
        //build data
        "appPath": "local/app/",
        "templatePath": "local/templates/",
        //Deploy data
        "destination": "/path/to/your/server/ozabaluev.ru/public_html/local/templates/",
        "root": "local/templates/"+ templateName,  
        "releasesDirectory": "/path/to/your/server/example.com/releases/",
        //Server data
        "hostname": "example.com",
        "username": "username",
        "port": 22
    }

}


let deployConfig;

//Template name is null
if(templateName.length == 0){ 

    console.log( chalk.bold.red('Введите название вашей темы (шаблона)'));
    process.exit();
    
}

// Checking arguments
if(argv.dev){

    deployConfig = deployJSON.dev;

}else if(argv.prod){

    deployConfig = deployJSON.prod;

}else{

    // Выводим предупреждение
    console.log( chalk.bold.red('"--dev" или "--prod" аргументы отсутствуют. Используйте : gulp <команда> --<аргумент>'));
    process.exit();

}


gulp.task('scss', function() {
	return gulp.src(deployConfig.appPath + '/sass/**/*.scss')
            .pipe(scss({ outputStyle: 'expand' }).on("error", notify.onError()))
            .pipe(rename({ suffix: '.min', prefix : '' }))
            .pipe(autoprefixer(['last 15 versions']))
            .pipe(cleancss( {level: { 1: { specialComments: 0 } } })) // Opt., comment out when debugging
            .pipe(gulp.dest(deployConfig.templatePath + deployConfig.templateName + '/'))
});

gulp.task('js', function() {
	return gulp.src([
            deployConfig.appPath + '/libs/jquery/dist/jquery.min.js',		
            deployConfig.appPath + '/js/common.js', // Always at the end
		])
        .pipe(concat('scripts.min.js'))
        .pipe(uglify()) // Mifify js (opt.)
        .pipe(gulp.dest(deployConfig.templatePath + deployConfig.templateName + '/js'))
});


gulp.task('watch', ['scss', 'js'], function() {

	gulp.watch(deployConfig.appPath + '/sass/**/*.scss', ['scss']);
	gulp.watch([deployConfig.appPath + '/libs/**/*.js', deployConfig.appPath + '/js/*.js'], ['js']);

});

gulp.task('default', ['watch']);


/*
* Устанавливаем SSH соединение c сервером command: gulp setupSSH --<argument>
*/ 
gulp.task('setupSSH', function(){

    //Путь до SSH ключа
    var homePath = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE
    var privateKey = homePath + '/.ssh/id_rsa';

    // Создание SSH объекта для удаленных команд
	sshConnect = new gulpSSH( {
		ignoreErrors: false,
		sshConfig: {
			host: deployConfig.hostname,
			port: deployConfig.port,
			username: deployConfig.username,
			privateKey: fs.readFileSync( privateKey )
		}
    } );

    // decide releaseDirectoryBase for rsync
    releasesDirecoryBase = ( deployConfig.releasesDirectory ) ? deployConfig.releasesDirectory : deployConfig.destination + '../releases/';
    
    var releaseDirCheckCommand = 'mkdir -p ' + releasesDirecoryBase;
	return sshConnect.shell( [ releaseDirCheckCommand ] )
                     .pipe(gulp.dest('./'))
                     .on('end', function(){ 
                        console.log( chalk.green( "SSH соединение установлено" ) );
                        console.log( chalk.green( "Ответ сервера:" ) );
                        console.log(chalk.yellow(fs.readFileSync('./gulp-ssh.exec.log' ).toString()) );//Файл ответа сервера
                      });
});


/*
* Загрузка файлов на сервер ( создается пустая папка releases ) command : gulp upload --<argument>
*/ 
gulp.task( 'upload', [ 'setupSSH' ], function() {

	var now     = new Date();
	var month   = "" + (now.getMonth() + 1);
	var day     = "" + now.getDate();
	var hours   = "" + now.getHours();
	var minutes = "" + now.getMinutes();
	var seconds = "" + now.getSeconds();

	// Calculate Timestamp
	timestamp = now.getFullYear()
	            + ( month.length < 2 ? "0" + month : month )
	            + ( day.length < 2 ? "0" + day : day )
	            + ( hours.length < 2 ? "0" + hours : hours )
	            + ( minutes.length < 2 ? "0" + minutes : minutes )
                + ( seconds.length < 2 ? "0" + seconds : seconds );
                
    console.log(chalk.yellow("Начало зарузки. Папка релиза "+timestamp));

	// generate releaseDirectory
	releasesDirecory = releasesDirecoryBase + timestamp + "/";

	// Установка конфигурации rsync
	var rsyncLocalConfig = {
        'destination': releasesDirecory,
        'root': deployConfig.root,
        'hostname': deployConfig.hostname,
        'username': deployConfig.username,
        'incremental': true,
        'progress': true,
        'relative': true,
        'emptyDirectory':true,
        'recursive': true,
        'recursiveclean': false,

        //Исключить из деплоя
        'exclude': [ 
			'node_modules/**',
			'.sass-cache/**',
			'/vendor/**' 
		]
    };


	return gulp.src( [ 
            deployConfig.root+'/**', 
            '!' + deployConfig.root + '/node_modules/**', 
            '!' + deployConfig.root + '/.sass-cache/**', 
            '!' + deployConfig.root + '/vendor/**' 
        ])
         .pipe( rsync( rsyncLocalConfig ) )
		 .on('end', function() { 
			console.log( chalk.green( 'Загрузка успешно завершена!' ) ); 
		});
} );


// Установка текущей версии command: gulp setcurrent --<argument>
gulp.task( 'setcurrent', [ 'upload' ], function() {

	// setup resetCurrentVersionCommand on the server
	var resetCurrentVersionCommand = 'cd ' + releasesDirecoryBase + ' && rm -rf current && rm -rf .currentTimeStamp && ln -s ' + releasesDirecory + ' current && echo "' + timestamp + '" >> .currentTimeStamp';

	return sshConnect.shell( [ resetCurrentVersionCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 

			console.log( chalk.green( "Текущая версия определена" ) ); 
			console.log( chalk.green( "Ответ сервера:" ) ); 
            console.log(chalk.yellow(fs.readFileSync('./gulp-ssh.exec.log' ).toString()) );//Файл ответа сервера

		 } );
} );

gulp.task( 'symlink', [ 'setcurrent' ], function() {

	console.log(chalk.yellow( "symlink - symlink" ));

	var symlinkCommand = 'mkdir -p ' + deployConfig.destination + ' && rm -rf ' + deployConfig.destination + deployConfig.themeName  +' &&  cd ' + deployConfig.destination + ' && ln -s ' + releasesDirecoryBase + 'current ' + deployConfig.themeName;

	return sshConnect.shell( [ symlinkCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 

			console.log( chalk.green( "Symlink Complete !" ) ); 
			console.log( chalk.green( "Output:" ) ); 
			// console.log( fs.readFileSync('./gulp-ssh.shell.log' ).toString() ); 

		} );
} );

//Деплой на сервен
gulp.task( 'deploy', [ 'setcurrent', 'symlink', 'upload', 'setupSSH' ] );

//Просмотр доступных релизов 
gulp.task( 'releases', [ 'setupSSH' ], function() {

	console.log(chalk.yellow( "releases - Папка с резилами" ));

	var showReleasesCommand = 'echo "\nList of Releases:\n" && ls -lsa ' + releasesDirecoryBase + ' && echo "\nCurrent Revision:\n" && cat ' + releasesDirecoryBase + '.currentTimeStamp && echo "\nTheme Directory Status:\n" && ls -lsa ' + deployConfig.destination + deployConfig.themeName;
	
	return sshConnect.shell( [ showReleasesCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 
			console.log( chalk.green( "Output:" ) ); 
			console.log( fs.readFileSync('./gulp-ssh.exec.log' ).toString() ); 
		} );
} );

//Откатиться на другую версию 
gulp.task( 'rollback', [ 'setupSSH' ], function() {

	console.log(chalk.yellow( "rollback - Откатиться к версии" ));

	if ( ! argv.revision ) {
		console.log( chalk.bold.red( 'You need to pass valid revision to be able to rollback ! USE : gulp rollback --<environment> --revision=<timestamp> !' ) );
		process.exit();
	}

	releasesDirecory = releasesDirecoryBase + argv.revision + "/";

	var rollbackCommand = '[ -d "' + releasesDirecory + '" ] && ( cd ' + releasesDirecoryBase + ' && rm -rf current && rm -rf .currentTimeStamp && ln -s ' + releasesDirecory + ' current && echo "' + argv.revision + '" >> .currentTimeStamp && mkdir -p ' + deployConfig.destination + ' && rm -rf ' + deployConfig.destination + deployConfig.themeName  +' &&  cd ' + deployConfig.destination + ' && ln -s ' + releasesDirecoryBase + 'current ' + deployConfig.themeName + ' && echo "Success : Rollback done successfully !" ) || echo "Error: Revision "' + argv.revision + '" does not exists. Please use gulp releases to view available releases."'

	return sshConnect.shell( [ rollbackCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 
			console.log( chalk.green( "Output:" ) ); 
			console.log( fs.readFileSync('./gulp-ssh.exec.log' ).toString() ); 
		} );
} );
