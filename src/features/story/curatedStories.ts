import type { Level, StoryContent } from '../../domain/content/types'

interface CuratedStory {
  title: string
  text: string
}

const CURATED_STORIES: Record<Level, CuratedStory> = {
  기초: {
    title: '빨간 공을 따라간 Mina',
    text: `Mina has a red ball. She takes it to the park. The morning is warm and bright.

Mina plays near a big tree. Then a little blue bird lands on her ball. The bird has a small letter in its beak.

Mina opens the letter. It says, “Please help me. I cannot find my family.” Mina looks at the bird. “I will help you,” she says.

There is a simple map in the letter. A red line starts at the park. Mina puts the ball in her bag and follows the line.

The first stop is a bakery. A kind baker gives Mina some bread. He saw three blue birds fly toward the river.

Mina and the little bird walk to the river. They see a dog beside the bridge. The dog looks at the bird and runs to a small blue feather.

Mina picks up the feather. “This came from your family,” she says. The little bird gives a happy chirp.

The red line crosses the bridge. On the other side, Mina sees a yellow ribbon on a tree. The same ribbon is drawn on the map.

A girl is watering flowers near the tree. She tells Mina, “I heard birds near the old house.” Mina thanks her and walks on.

The road is quiet now. The sun is going down. The little bird stays close to Mina.

Mina feels a little afraid, but she keeps walking. “We are almost there,” she tells the bird.

Soon they find the old house. The door is closed. Mina hears a soft chirp from inside.

The little bird answers, “Chirp, chirp!” A louder chirp comes from the house. Mina smiles.

She looks at the map again. A tiny key is drawn under a flower pot. Mina checks the pot beside the door.

There is a small key under it. Mina opens the door. The little bird flies inside at once.

Three blue birds are waiting by the window. They fly around the little bird. The family is together again.

Mina sits on the floor and laughs. The birds sing a bright, happy song. The old house does not feel dark anymore.

Before Mina leaves, the little bird brings her one blue feather. Mina puts it safely in her bag.

Mina walks home under the evening sky. Her red ball is still in her bag, and the blue feather is beside it.

The next morning, Mina goes back to the park. She sees four blue birds in the big tree.

The little bird flies down and sits on her red ball again. Mina smiles. This time, no one is lost.`,
  },
  유치원: {
    title: '빛을 잃은 이야기책',
    text: `After school, Mina goes to the library. On a small desk, she finds an old storybook. A gold star is on the cover.

Mina opens the book. Most pages have bright pictures, but one page is white. There are no words on it.

A tiny light comes from the white page. Then a short message appears: “Our story is losing its light. Please find the missing ending.”

Mina calls her friends Joon and Sara. They sit around the desk and look at the book together.

The first picture shows a clock. The clock says three. Joon looks at the school clock and finds a blue paper behind it.

The paper has a drawing of a paintbrush. The three friends go to the art room. A box of old pictures is under the teacher’s table.

One picture shows the school many years ago. There is a small garden where the new playground stands today.

On the back, someone wrote, “A story grows when people care for it.” Mina reads the sentence two times.

The book shines again. A new picture appears. It shows a red flower and a little stone path.

Mina, Joon, and Sara run to the school garden. They find the same red flower beside the fence.

Under the flower is a flat stone. Sara lifts it carefully. There is a small wooden key below it.

The key does not open a real door. When Mina puts it on the white page, a paper door appears in the book.

The friends hold hands. Mina touches the paper door. The page turns by itself.

Now they see a dark classroom in an old picture. A girl is sitting alone by the window. She has the same storybook on her desk.

Words appear below the picture: “Who gave the book its first light?” The friends think about the question.

Joon says, “Maybe it was the teacher.” Sara says, “Maybe it was the girl.” Mina looks at the old pictures again.

In every picture, different children are holding the book. Some are reading. Some are drawing. Some are helping younger children.

Mina understands. “It was not one person,” she says. “The light came from everyone who shared the story.”

The white page glows, but the ending is still missing. One last line appears: “Then write what happens next.”

Mina takes a pencil. Joon tells the first sentence. Sara adds the next one. Mina writes their words in the book.

They write about three friends who found an old story and gave it a new ending. As Mina writes the last word, the whole book becomes bright.

The pictures move like a tiny movie. The old school, the garden, the children, and the three friends all appear together.

The next morning, Mina brings the book to class. The teacher reads the new ending aloud.

Everyone listens quietly. Then the children ask to add their own pictures. The teacher gives them paper and colored pencils.

By the end of the day, the book has many new pages. Its light is warmer than before.

Mina puts the storybook back in the library. The gold star on the cover shines once, as if the book is saying, “Thank you.”`,
  },
  초등학교: {
    title: '네 장의 편지와 비밀 정원',
    text: `On the first morning of summer vacation, Mina found a green envelope under a bench in the city garden. Her name was written on the front, but there was no sender.

Inside was a letter and a small map. The letter said that the garden might close at the end of the week. If Mina wanted to help save it, she had to find four hidden letters before sunset the next day.

Mina called her friends Joon and Sara. They met beside the fountain with water, snacks, a notebook, and Mina’s old camera. The first mark on the map pointed to the glass house at the north end of the garden.

The glass house had been locked for years, but a side window was open. Inside, vines covered the walls and dust lay on every table. In the corner, Mina found an old photograph under a broken flowerpot.

The photograph showed the same garden fifty years earlier. There were no tall buildings behind it, and a huge tree stood where the parking lot was now. On the back were six words: “The oldest tree remembers the first promise.”

Joon searched the tables and found the first letter inside a wooden seed box. It explained that the garden had once belonged to the whole neighborhood. Families planted trees there after a great storm damaged many homes.

The second clue led them to the public library. Mina expected another letter, but the librarian gave them a newspaper from thirty years ago instead. A small article described a plan to build shops on part of the garden.

Someone had circled one sentence in blue ink: “The plan was stopped after children collected more than two thousand signatures.” Sara noticed that the same blue ink marked a number at the bottom of the page: 214.

They opened locker 214 near the library entrance. The second letter was inside. It said, “A garden survives when people remember why it matters.”

The third clue took them across town to an empty yellow house. An old woman named Mrs. Han was waiting on the porch. She smiled when Mina showed her the green envelope.

Mrs. Han had lived beside the garden as a child. She told them that her father helped build the first stone path and that her mother taught children how to grow tomatoes and beans there.

Before the friends left, Mrs. Han gave Mina a small metal box. The third letter was inside with several faded photographs. One picture showed dozens of neighbors standing around the oldest tree.

The final clue was written on the edge of that photograph: “Meet where the city can see the whole garden.” The friends guessed that it meant the hill behind the old greenhouse.

They reached the hill late in the afternoon. Dark clouds were moving in, and the wind was getting stronger. From the top, they could see the garden, the library, the yellow house, and the river beyond the city.

A sudden gust pulled the map from Joon’s hands. Sara caught it, but rain began before they could find the last letter. The three friends ran into a small shelter near the hill.

The green envelope was wet, and part of the map had torn. Mina felt terrible. They had only one clue left, and the storm was washing it away.

Joon spread the pieces on a bench. Sara used Mina’s camera to enlarge the photographs. Mina compared the shapes of the paths in the old pictures with the paths on the damaged map.

Then she saw it. The four locations formed the shape of a leaf. At the center of the leaf was the oldest tree.

When the rain became lighter, the friends hurried back to the garden. Water ran along the paths, and the wind shook the branches above them.

At the base of the oldest tree, they found a flat stone with a small metal ring. Together they lifted it. A narrow box had been hidden underneath.

The fourth letter was inside, along with copies of old agreements, photographs, and a list of names. The papers showed that the garden had been protected for public use many years earlier.

Mina finally understood the mystery. The four letters were not asking them to discover treasure. They were guiding them toward the history that proved why the garden should remain open.

The next morning, the city held a public meeting about the garden. Mina, Joon, and Sara arrived with the four letters, the photographs, and the old agreements.

At first, the adults were surprised to see three children carrying the evidence. Mina was nervous, but she explained each clue in the order they had found it.

Mrs. Han came to the meeting too. The librarian brought the old newspaper. Other neighbors recognized names and faces in the photographs.

The city workers checked the agreements. By afternoon, they confirmed that the papers were real and that the old promise to keep the garden public had never been canceled.

The plan to close the garden was stopped. Instead, the city decided to repair the glass house, protect the oldest tree, and create a small history room near the entrance.

A week later, Mina and her friends returned to help clean the glass house. They planted new flowers beside the old stone path.

Mrs. Han brought tomato seeds from her own garden. The librarian donated copies of the newspaper pages. Families added photographs and short memories to the new history room.

Mina placed copies of the four letters in a glass case. Under them, she wrote one sentence: “A place can survive when people remember its story and choose to care for it.”

That evening, the three friends sat beneath the oldest tree. The garden was full of voices, birds, and warm summer light.

Joon asked whether Mina thought another secret letter might appear someday. Mina looked at the green envelope in her notebook and smiled. “Maybe,” she said. “But next time, we already know where to start: with the story people almost forgot.”`,
  },
  중학교: {
    title: '도시의 마지막 기록',
    text: `Mina had planned to spend her summer writing a simple report about Riverside, one of the oldest districts in the city. Instead, she found a blank space in the public archive that changed the entire project.

Twenty-two years earlier, hundreds of families had left Riverside during a large redevelopment project. The official record said that the residents had agreed to move. Yet several later documents referred to protests, unpaid compensation, and property claims that did not appear anywhere in the main file.

Mina asked the archive clerk whether part of the record had been lost. The clerk checked the catalog twice and shook his head. “According to the system, nothing is missing,” he said. That answer made Mina more curious, not less.

The first useful clue came from an old map. Someone had drawn a red circle around three blocks near the river and written a date in the margin. The date was six months earlier than the official start of redevelopment.

Mina wrote the date down and compared it with newspaper reports from the same year. Most articles described Riverside as an empty, unsafe neighborhood that needed to be rebuilt. One small local paper told a different story: families were still living there when demolition plans were announced.

She visited the former Riverside community center, now used as a storage building. In a cabinet, she found meeting notes, repair receipts, and a photograph of residents standing in front of the center. The date on the photograph matched the date on the map.

The documents did not prove that the official history was false, but they proved that it was incomplete. Mina created a timeline and marked every fact with its source. If two sources disagreed, she recorded both instead of choosing the version she preferred.

A retired teacher named Mr. Park agreed to speak with her. He had taught at Riverside Middle School before it closed. He remembered families receiving notices that gave them only a short time to respond.

“Some people accepted the offer,” he explained. “Others wanted independent reviews of their homes and shops. The public report later treated everyone as if they had made the same choice.”

Mina asked whether he had kept any documents. Mr. Park brought out a box of class photographs, letters, and copies of notices. One notice used the phrase “voluntary agreement,” but a handwritten note beside it said, “No meeting held.”

That contradiction became the center of Mina’s investigation. She needed to find out who had written the note and whether other records supported it.

The city office gave her access to property registers from the period. Most pages were ordinary, but several entries had been changed on the same day by the same department. The original owners’ names had been replaced with a redevelopment agency before final agreements were recorded.

Mina showed the pattern to her teacher, who warned her not to make an accusation too early. A suspicious pattern was not the same as proof. Mina agreed and decided to look for independent evidence.

She came across a set of bank records in a public court file. They showed that compensation money had been transferred to a temporary account, then returned to the redevelopment agency months later because several families had never collected it.

The official summary had described all compensation as completed. Mina now had two records that did not fit that statement: the property register and the bank file.

A former city accountant, Ms. Lee, helped her understand the numbers. She explained that unclaimed money should have remained traceable to each family. In the Riverside case, several names had disappeared from the final accounting table.

Mina began to see how the gaps were connected. The missing names, altered property entries, and simplified public report all pushed the same story: that the redevelopment had been smooth and fully agreed upon.

Then an email arrived from an unknown address. It contained one sentence: “Stop looking into Riverside if you want to finish your project.” Mina felt a cold wave of fear, but she saved the message and told her teacher and parents immediately.

They agreed that Mina should not meet unknown sources alone and should keep copies of every document in more than one place. The investigation could continue, but only with clear safety rules.

Two days later, another email arrived. This one came from a former records employee who had read about Mina’s project. He offered to meet at the public library with a librarian present.

The employee, Mr. Choi, said that he had helped scan Riverside documents years after the redevelopment. During that process, he noticed that several folders had been marked “duplicate” and removed from the main archive.

He had not taken the documents, but he remembered the storage code. Mina and the librarian searched the archive index again using that code. They found a reference to a sealed box that had been transferred to an off-site records room.

The city approved a supervised inspection. Inside the box were copies of meeting minutes, resident objections, and internal memos. The papers showed that officials had known about unresolved claims before the final public report was written.

One memo was especially important. It instructed staff to “simplify the public summary” because detailed disputes might delay the redevelopment schedule. The sentence did not prove a criminal plan, but it clearly explained why the official history had left out major conflicts.

Mina revised her report from the beginning. She removed several dramatic sentences that she could not fully support. In their place, she used dates, quotations from public records, and side-by-side comparisons of conflicting documents.

Her conclusion was careful: Riverside residents had not shared one single experience. Some had moved willingly, some had protested, and some compensation claims had remained unresolved. The later public record had turned those different experiences into one convenient version.

Before publishing, Mina contacted the city and the redevelopment agency for responses. The city said the archive would review the newly found material. The agency argued that the project had followed the rules in force at the time.

Mina included both responses. She also wrote that the purpose of the report was not to decide guilt, but to restore missing evidence so that the public could judge the history more fairly.

When the report was released, former Riverside residents began sending photographs, letters, and personal records to the archive. Some supported Mina’s findings. Others corrected details in her timeline.

Mina welcomed the corrections. A trustworthy record, she had learned, was not a story that never changed. It was a record that showed where its information came from and changed when stronger evidence appeared.

The city formed an independent review group. It reopened several compensation cases and added the removed documents to the public archive. The original report was not deleted; instead, it was displayed beside a new explanation describing what had been omitted.

Months later, Mina visited the archive again. The blank space in the Riverside collection was gone. In its place were several boxes, a digital index, and recorded interviews from residents with different memories of the same events.

Mr. Park came to see the new collection. He found an old class photograph and pointed to a row of students. “People think a city is made of roads and buildings,” he said. “But records remind us that a city is also made of lives.”

Mina understood why the missing documents had mattered so much. When a record disappears, people do not lose only paper. They can lose proof that their experience happened at all.

She closed her notebook and looked through the archive window toward the river. Riverside had changed completely, but the people who once lived there were part of the city’s history again.

At the bottom of her final page, Mina wrote one last sentence: “A public record is never just the past. It is a promise that the future will be able to ask what happened—and still find an honest answer.”`,
  },
}

export function curatedStoryText(story: StoryContent): string {
  const curated = CURATED_STORIES[story.level]
  return story.title === curated.title ? curated.text : story.storyText
}
