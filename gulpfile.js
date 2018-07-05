const gulp          = require('gulp'); // Галп

//Build packages
const scss          = require('gulp-sass');
const concat        = require('gulp-concat');
const uglify        = require('gulp-uglify');
const cleancss      = require('gulp-clean-css');
const rename        = require('gulp-rename');
const autoprefixer  = require('gulp-autoprefixer');
const notify        = require("gulp-notify");
const gulpif        = require("gulp-if");

//Deploy packages
const argv          = require('yargs').argv;
const fs            = require('fs.extra');
const rsync         = require('gulp-rsync'); 
const gulpSSH       = require('gulp-ssh');
const chalk         = require('chalk');
const confirm        = require('gulp-confirm');

//Settings
const templateName  = "dsc" //Name of theme. No empty
let deployConfig;

const appConfig = {
    "themeName": templateName, 
    "appPath": "local/app/",
    "templatePath": "local/templates/",
}

const deployJSON = {
    
    "dev": {
        "themeName": templateName, 
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
        "destination": "/path/to/your/server/ozabaluev.ru/public_html/local/templates/",
        "root": "local/templates/"+ templateName,  
        "releasesDirectory": "/path/to/your/server/example.com/releases/",
        //Server data
        "hostname": "example.com",
        "username": "username",
        "port": 22
    }

}

//Template name is null
if(templateName.length == 0){ 
    console.log( chalk.bold.red('Введите название вашей темы (шаблона)'));
    process.exit();
}

gulp.task('scss', function() {
	return gulp.src(appConfig.appPath + '/scss/**/*.scss')
            .pipe(scss({ outputStyle: 'expand' }).on("error", notify.onError()))
            .pipe(rename({ suffix: '.min', prefix : '' }))
            .pipe(autoprefixer(['last 15 versions']))
            .pipe(cleancss( {level: { 1: { specialComments: 0 } } }))
            .pipe(gulp.dest(appConfig.templatePath + appConfig.themeName + '/'))
});

gulp.task('js', function() {
	return gulp.src([
            appConfig.appPath + '/libs/jquery/dist/jquery.min.js',		
            appConfig.appPath + '/js/common.js', // Always at the end
		])
        .pipe(concat('scripts.min.js'))
        .pipe(gulpif(argv.prod, uglify())) // onle for production
        .pipe(gulp.dest(appConfig.templatePath + appConfig.themeName + '/js'))
});

gulp.task('watch', ['scss', 'js'], function() {

	gulp.watch(appConfig.appPath + '/scss/**/*.scss', ['scss']);
	gulp.watch([appConfig.appPath + '/libs/**/*.js', appConfig.appPath + '/js/*.js'], ['js']);

});

gulp.task('preperation', ['scss', 'js'], function(){
    console.log( chalk.green( "Подготовка файлов к деплою на production завершена." ) ); 
});

gulp.task('setupSSH', function(){

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
                        //console.log( chalk.green( "Ответ сервера:" ) );
                        //console.log(chalk.yellow(fs.readFileSync('./gulp-ssh.exec.log' ).toString()) );//Файл ответа сервера
                      });
});

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
            '/bitrix',
            '/node_modules',
            '/upload',
            '/.git',
            '/.idea',
            '.bowerrc',
            '.DS_Store',		
            '.gitignore',
            'gulpfile.js',

            //templates files
            '/templates/dsc/header.php',
            '/templates/dsc/footer.php',
        ]
        
    };


	return gulp.src([ 
            deployConfig.root+'/**', 
            '!' + deployConfig.root + '/node_modules/**', 
            '!' + deployConfig.root + '/.sass-cache/**', 
            '!' + deployConfig.root + '/vendor/**' 
        ])
         .pipe(gulpif(argv.prod, confirm({

            question: 'Вы пытаетесь залить файлы на production сервер. Продолжить? (Y/N)',
            proceed: function(answer) {
                
                switch(answer) {
                    case 'Y': 
                        return true;
                      break;
                  
                    case 'N':  
                        console.log('Операция отменена!'); 
                        process.exit();
                      break;
                  
                    default:
                        console.log('Неизвестная команда.'); 
                        process.exit();
                      break;
                  }

              }

          })))
         .pipe(rsync(rsyncLocalConfig))
		 .on('end', function() { 
			console.log( chalk.green( 'Загрузка успешно завершена!' ) ); 
        });
        
});

gulp.task( 'setcurrent', [ 'upload' ], function() {

	// setup resetCurrentVersionCommand on the server
	var resetCurrentVersionCommand = 'cd ' + releasesDirecoryBase + ' && rm -rf current && rm -rf .currentTimeStamp && ln -s ' + releasesDirecory + ' current && echo "' + timestamp + '" >> .currentTimeStamp';

	return sshConnect.shell( [ resetCurrentVersionCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 
			console.log( chalk.green( "Текущая версия определена" )); 
			//console.log( chalk.green( "Ответ сервера:" )); 
            //console.log( chalk.yellow(fs.readFileSync('./gulp-ssh.exec.log' ).toString()));//Файл ответа сервера
		 } );
});

gulp.task( 'symlink', [ 'setcurrent' ], function() {

	var symlinkCommand = 'mkdir -p ' + deployConfig.destination + ' && rm -rf ' + deployConfig.destination + deployConfig.themeName  +' &&  cd ' + deployConfig.destination + ' && ln -s ' + releasesDirecoryBase + 'current ' + deployConfig.themeName;

	return sshConnect.shell( [ symlinkCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 

			console.log( chalk.green( "Символьная ссылка проставлена!" ) ); 
			// console.log( chalk.green( "Output:" ) ); 
			// console.log( fs.readFileSync('./gulp-ssh.shell.log' ).toString() ); 

		} );
});

gulp.task( 'deploy', [ 'setcurrent', 'symlink', 'upload', 'setupSSH' ] );

gulp.task( 'releases', [ 'setupSSH' ], function() {

	var showReleasesCommand = 'echo "\nList of Releases:\n" && ls -lsa ' + releasesDirecoryBase + ' && echo "\nCurrent Revision:\n" && cat ' + releasesDirecoryBase + '.currentTimeStamp && echo "\nTheme Directory Status:\n" && ls -lsa ' + deployConfig.destination + deployConfig.themeName;
	
	return sshConnect.shell( [ showReleasesCommand ] )
		.pipe( gulp.dest( './' ) )
		.on( 'end', function() { 
			console.log( chalk.green( "Output:" ) ); 
			console.log( fs.readFileSync('./gulp-ssh.exec.log' ).toString() ); 
		} );
} );


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
