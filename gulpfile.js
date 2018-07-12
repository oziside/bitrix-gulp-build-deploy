const gulp          = require('gulp'); // Галп

//Пакеты сборки
const scss          = require('gulp-sass');
const concat        = require('gulp-concat');
const uglify        = require('gulp-uglify');
const cleancss      = require('gulp-clean-css');
const rename        = require('gulp-rename');
const autoprefixer  = require('gulp-autoprefixer');
const notify        = require("gulp-notify");
const gulpif        = require("gulp-if");

//Пакеты для деплоя
const argv          = require('yargs').argv;
const fs            = require('fs.extra');
const rsync         = require('gulp-rsync'); 
const gulpSSH       = require('gulp-ssh');
const chalk         = require('chalk');
const confirm        = require('gulp-confirm');

//Настройки
const templateName  = "" //Название темы. Не должно быть пустым
let deployConfig;

const appConfig = {
    "themeName": templateName, 
    "appPath": "local/app/",
    "templatePath": "local/templates/",
}

const deployJSON = {
    
    "dev": {
        "themeName": templateName,
        "destination": "/path/to/your/server/ozabaluev.ru/public_html/local/templates/",
        "root": "local/templates/"+ templateName,  
        "releasesDirectory": "/path/to/your/server/example.com/releases/",
        //Данные сервера
        "hostname": "ozisidob.beget.tech",
        "username": "ozisidob",
        "port": 22
    },
    "prod": {
        "themeName": templateName,
        "destination": "/path/to/your/server/ozabaluev.ru/public_html/local/templates/",
        "root": "local/templates/"+ templateName,  
        "releasesDirectory": "/path/to/your/server/example.com/releases/",
        //Данные сервера
        "hostname": "example.com",
        "username": "username",
        "port": 22
    }

}

//Если не указано название темы
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
            appConfig.appPath + '/js/common.js', // Всегда в конце
		])
        .pipe(concat('scripts.min.js'))
        .pipe(gulpif(argv.prod, uglify())) // Минификация js происходит только при отправке на продакшн
        .pipe(gulp.dest(appConfig.templatePath + appConfig.themeName + '/js'))
});

gulp.task('watch', ['scss', 'js'], function() {

	gulp.watch(appConfig.appPath + '/scss/**/*.scss', ['scss']);
	gulp.watch([appConfig.appPath + '/libs/**/*.js', appConfig.appPath + '/js/*.js'], ['js']);

});

gulp.task('setupSSH', function(){

    // Проверка аргументов
    if(argv.dev){
        deployConfig = deployJSON.dev;
    }else if(argv.prod){
        deployConfig = deployJSON.prod;
    }else{
        console.log( chalk.bold.red('"--dev" или "--prod" аргументы отсутствуют. Используйте : gulp <команда> --<аргумент>'));
        process.exit();
    }

    var homePath = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE
    var privateKey = homePath + '/.ssh/id_rsa';

	sshConnect = new gulpSSH( {
		ignoreErrors: false,
		sshConfig: {
			host: deployConfig.hostname,
			port: deployConfig.port,
			username: deployConfig.username,
			privateKey: fs.readFileSync( privateKey )
		}
    } );

    // Определение директории для релизов
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

	timestamp = now.getFullYear()
	            + ( month.length < 2 ? "0" + month : month )
	            + ( day.length < 2 ? "0" + day : day )
	            + ( hours.length < 2 ? "0" + hours : hours )
	            + ( minutes.length < 2 ? "0" + minutes : minutes )
                + ( seconds.length < 2 ? "0" + seconds : seconds );

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

            //файлы темы. Не удалять
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
                        console.log('Операция отменена.'); 
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

	var showReleasesCommand = 'echo "\nСписок релизов:\n" && ls -lsa ' + releasesDirecoryBase + ' && echo "\nТекущая версия:\n" && cat ' + releasesDirecoryBase + '.currentTimeStamp && echo "\nСтатус директории темы:\n" && ls -lsa ' + deployConfig.destination + deployConfig.themeName;
	
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
		console.log( chalk.bold.red( 'Вам необходимо указать версию к которой необходимо откатиться! Испульзуйте : gulp rollback --<тип сервера> --revision=<номерверсии> !' ) );
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