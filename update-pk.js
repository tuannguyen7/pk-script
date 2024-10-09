import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters'
import { Client } from '@notionhq/client';

const telegramBotToken = process.env.BOT_TOKEN;
const notionIntegrationToken = process.env.NOTION_TOKEN;
const notionDatabaseId = process.env.NOTION_DB_TOKEN;
const relatedNotionDatabaseId = process.env.NOTION_RELATED_DB_ID;

// List of authorized user IDs (you can add Telegram user IDs here)
const authorizedUsers = [947871123, 911093644];

const bot = new Telegraf(telegramBotToken);
const notion = new Client({ auth: notionIntegrationToken });

let relationOptions = [];
let lastAddedRelation = null;

async function getRelationOptions(databaseId) {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      sorts: [
        {
          property: 'Day',
          direction: 'ascending',
        },
      ],
    });

    return response.results.map(page => ({
      id: page.id,
      name: page.properties.Day.title[0].plain_text,
    }));
  } catch (error) {
    console.error('Error fetching relation options:', error);
    return [];
  }
}

async function initBot() {
  relationOptions = await getRelationOptions(relatedNotionDatabaseId);
  console.log('Available relations:', relationOptions.map(opt => opt.name).join(', '));

  bot.command('when', async (ctx) => {
    const username = `${ctx.from.first_name} ${ctx.from.last_name}`.trim() || ctx.from.username;
    const userId = ctx.from.id;
    if (!authorizedUsers.includes(userId)) {
      ctx.reply('You are not authorized to use this bot.');
      return;
    }

    const relationName = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!relationName) {
      ctx.reply('When does the game happen?. Usage: /when <time_specific>');
      return;
    }

    try {
      await addRecordToRelationDB(relatedNotionDatabaseId, relationName, username);
      ctx.reply(`Time "${relationName}" added successfully.`);
      relationOptions = await getRelationOptions(relatedNotionDatabaseId);
      lastAddedRelation = relationOptions.find(opt => opt.name.toLowerCase() === relationName.toLowerCase());
      ctx.reply('You can now add a record using the format: name:string,in:number,out:number');
    } catch (error) {
      console.error('Error adding time:', error);
      ctx.reply('An error occurred while adding the relation. Please try again later.');
    }
  });

  bot.command('refresh', async (ctx) => {
    try {
      relationOptions = await getRelationOptions(relatedNotionDatabaseId);
      ctx.reply(`Time option refreshed add new using /when. Available options are: ${relationOptions.map(opt => opt.name).join(', ')}`);
      lastAddedRelation = '';
    } catch (error) {
      console.error('Error refreshing Time relation:', error);
      ctx.reply('An error occurred while refreshing relations. Please try again later.');
    }
  });

  bot.on(message('text'), async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name}`.trim();

    if (!authorizedUsers.includes(userId)) {
      ctx.reply('You are not authorized to use this bot.');
      return;
    }

    const message = ctx.message.text;
    const commandParams = message.split(',');

    if (commandParams.length !== 3) {
      ctx.reply('Invalid command format. Use: name:string,in:number,out:number');
      return;
    }

    const [name, inValue, outValue] = commandParams.map(param => param.trim());

    if (isNaN(parseInt(inValue)) || isNaN(parseInt(outValue))) {
      ctx.reply('Invalid input: "in" and "out" must be numbers.');
      return;
    }

    if (!lastAddedRelation) {
      ctx.reply('Please first add Time using the /when command.');
      return;
    }

    try {
      await addRecordToNotion(name, parseInt(inValue), parseInt(outValue), lastAddedRelation.id, username);
      ctx.reply(`Record added successfully to Notion database with Time "${lastAddedRelation.name}".`);
    } catch (error) {
      console.error('Error processing request:', error);
      ctx.reply('An error occurred while processing your request. Please try again later.');
    }
  });

  bot.launch();
  console.log('Bot is running...');
}

async function addRecordToNotion(name, inValue, outValue, relationId, username) {
  await notion.pages.create({
    parent: { database_id: notionDatabaseId },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      In: { number: inValue },
      Out: { number: outValue },
      When: {
        relation: [
          { id: relationId }
        ]
      },
      AddedBy: { rich_text: [{ text: { content: username } }] }
    }
  });
}

async function addRecordToRelationDB(relationDB, relationName, username) {
  const currentDate = new Date().toISOString().split('T')[0];
  await notion.pages.create({
    parent: { database_id: relationDB },
    properties: {
      Day: { title: [{ text: { content: relationName } }] },
      Date: { date: { start: currentDate } },
      Banker: { rich_text: [{ text: { content: username } }] } // Add current date      
    }
  });
}

initBot();
