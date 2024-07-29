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

let relationOptions = [];

async function initBot() {
  relationOptions = await getRelationOptions(relatedNotionDatabaseId);
  console.log('Available relations:', relationOptions.map(opt => opt.name).join(', '));

  bot.on(message('text'), async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name}`.trim();

    if (!authorizedUsers.includes(userId)) {
      ctx.reply('You are not authorized to use this bot.');
      return;
    }

    const message = ctx.message.text;
    const commandParams = message.split(',');

    if (commandParams.length !== 4) {
      ctx.reply('Invalid command format. Use: name:string,in:number,out:number,when:string');
      return;
    }

    const [name, inValue, outValue, relation] = commandParams.map(param => param.trim());

    if (isNaN(parseInt(inValue)) || isNaN(parseInt(outValue))) {
      ctx.reply('Invalid input: "in" and "out" must be numbers.');
      return;
    }

    try {
      if (!relationOptions.find(opt => opt.name.toLowerCase() === relation.toLowerCase())) {
        await addRecordToRelationDB(relatedNotionDatabaseId, relation);
        ctx.reply('New relation added to the database.');
        relationOptions = await getRelationOptions(relatedNotionDatabaseId);
      }

      const relationOption = relationOptions.find(opt => opt.name.toLowerCase() === relation.toLowerCase());

      await addRecordToNotion(name, parseInt(inValue), parseInt(outValue), relationOption.id, username);
      ctx.reply('Record added successfully to Notion database.');
    } catch (error) {
      console.error('Error processing request:', error);
      ctx.reply('An error occurred while processing your request. Please try again later.');
    }
  });

  bot.command('refresh', async (ctx) => {
    try {
      relationOptions = await getRelationOptions(relatedNotionDatabaseId);
      ctx.reply(`Relations refreshed. Available options are: ${relationOptions.map(opt => opt.name).join(', ')}`);
    } catch (error) {
      console.error('Error refreshing relations:', error);
      ctx.reply('An error occurred while refreshing relations. Please try again later.');
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
      Accountant: {
        relation: [
          { id: relationId }
        ]
      },
      AddedBy: { rich_text: [{ text: { content: username } }] }
    }
  });
}

async function addRecordToRelationDB(relationDB, relationName) {
  await notion.pages.create({
    parent: { database_id: relationDB },
    properties: {
      Day: { title: [{ text: { content: relationName } }] }       
    }
  });
}

initBot();
