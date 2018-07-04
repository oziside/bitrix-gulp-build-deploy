# Сборщик + SSH Деплой проекта 1C-Битрикс. 

Сборщик проетов на CSM-Битрикс.

**Возможности**

- использование препроцессора Sass
- использование ES6 синтаксиса
- объеденение и минификация css/js файлов
- SSH деплой на dev и prod серверы с сохранением итории релизов
- возможность откатиться к более ранней версии проектта
- загрузка плагинов с помощью bowerrc


### Подготовка

Для начала работы необходимо установить демо-версию Битрикса с помощью файла установки <a href="http://www.1c-bitrix.ru/download/scripts/bitrixsetup.php">BitrixSetup.php</a>

В корневую папку системы 1С-Битрикс клонируете файлы репозетория:
```
git clone https://github.com/oziside/bitrix-gulp-build-deploy.git
```
Если вы используете Windows 10 для работы, то для деплоя лучше установить подсистму Ubuntu,т.к. с window есть проблемы. C Ubuntu и Mac OS проблем не наблюдается.

#### Инструкция по установке Ubuntu

НАПИСАТЬ

Далее установим свежий стабильный Node.js и Gulp. Откройте Командную строку или PowerShell, введите команду bash и установите:

```
$ curl -sL https://deb.nodesource.com/setup_6.x -o nodesource_setup.sh
```
Здесь _6.x - первая цифра последнего стабильного релиза. Её можно узнать на сайте Nodejs.

Далее выполним команду:

```
 sudo bash nodesource_setup.sh
```
И установим Node.js:

```
$ sudo apt-get install nodejs
```
После этого установите Gulp глобально в вашей Linux подсистеме ($ npm i -g gulp) и установите все пакеты проекта ($ npm i), который мы подготовили ранее.
