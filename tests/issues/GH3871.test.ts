import {
  Collection,
  Entity,
  LoadStrategy,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Ref,
  Reference,
} from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/sqlite';

@Entity()
export class User {

  @PrimaryKey()
  id!: number;

  @OneToMany(() => Pet, p => p.user)
  pets = new Collection<Pet>(this);

}

@Entity()
export class Pet {

  @PrimaryKey()
  id!: number;

  @Property({ type: 'text', default: 'yo' })
  name: string;

  @ManyToOne(() => User, {
    ref: true,
    nullable: true,
  })
  user: Ref<User> | null = null;

  @ManyToOne(() => Action, {
    ref: true,
    nullable: true,
  })
  action: Ref<Action> | null = null;

  constructor(name: string) {
    this.name = name;
  }

}

@Entity()
export class Action {

  @PrimaryKey()
  id!: number;

  @Property({ type: 'text' })
  name: string;

  @OneToMany(() => Pet, p => p.action)
  pets = new Collection<Pet>(this);

  constructor(name: string) {
    this.name = name;
  }

}

describe('GH issue 3871', () => {

  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      entities: [User, Action, Pet],
      loadStrategy: LoadStrategy.JOINED,
      dbName: ':memory:',
      debug: true,
    });
    await orm.schema.refreshDatabase();
    await createEntities();
  });

  beforeEach(() => orm.em.clear());
  afterAll(() => orm.close(true));

  async function createEntities() {
    for (let i = 0; i < 10; i++) {
      const user = new User();

      for (let i = 0; i < 10; i++) {
        const pet = new Pet('name - ' + Math.random().toString());
        pet.user = Reference.create(user);

        if (i === 2) {
          pet.name = 'yoyo';
        }

        for (let i = 0; i < 10; i++) {
          const action = new Action('name - ' + Math.random().toString());
          pet.action = Reference.create(action);
          orm.em.persist(action);
        }

        orm.em.persist(pet);
      }

      orm.em.persist(user);
    }

    await orm.em.flush();
    orm.em.clear();
  }

  test('joined with populateWhere', async () => {
    const populateWhereJoined = await orm.em.find(
      User,
      {},
      {
        populate: ['pets'],
        populateWhere: {
          pets: {
            name: {
              // should populate all pets except yoyo
              $like: 'name%',
            },
          },
        },
        strategy: LoadStrategy.JOINED,
      },
    );

    // this ignores the populateWhere filter as it seems
    // select ... from "user" as "u0" left join "pet" as "p1" on "u0"."id" = "p1"."user_id"

    console.log(populateWhereJoined[3].pets.length);
    console.log(populateWhereJoined[3].pets[2].name);
  });

  test('select in with populateWhere', async () => {
    // 3 - populateWhere find SELECT_IN
    const populateWhereSelectIn = await orm.em.find(
      User,
      {},
      {
        populate: ['pets'],
        populateWhere: {
          pets: {
            name: 'yoyo',
          },
        },
        strategy: LoadStrategy.SELECT_IN,
      },
    );

    // [query] select "u0".* from "user" as "u0" [took 1 ms]
    // [query] select "p0".* from "pet" as "p0" where "p0"."user_id" in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30) and "p0"."name" = 'yoyo' order by "p0"."user_id" asc

    // this works as intended, most users have 0 pets, while some have 1 with the name "yoyo"
    console.log('populateWhereSelectIn', JSON.parse(JSON.stringify(populateWhereSelectIn)));
  });

  test('pagination with joined strategy and populateWhere', async () => {
    const [paginationJoined] = await orm.em.findAndCount(
      User,
      {},
      {
        strategy: LoadStrategy.JOINED,
        populate: ['pets'],
        populateWhere: {
          pets: {
            name: 'yoyo',
          },
        },
        limit: 30, // will test with and without below
      },
    );

    // with limit: 30

    // [query] select count(*) as "count" from "user" as "u0" [took 1 ms]
    // [query] select "u0"."id", "p1"."id" as "p1__id", "p1"."name" as "p1__name", "p1"."user_id" as "p1__user_id", "p1"."action_id" as "p1__action_id" from "user" as "u0" left join "pet" as "p1" on "u0"."id" = "p1"."user_id" where "u0"."id" in (select "u0"."id" from (select "u0"."id" from "user" as "u0" left join "pet" as "p1" on "u0"."id" = "p1"."user_id" group by "u0"."id" limit 2) as "u0") and "p1"."name" = 'yoyo' [took 2 ms]

    // the weird thing is that here I can see that the query is trying to fetch the pets with the name "yoyo"
    // but in the second (2 - populateWhere find JOINED) example, it did not even try

    // weird, it fetched only one record where the populateWhere filter was found
    console.log('paginationJoined', JSON.parse(JSON.stringify(paginationJoined))); // { paginationJoined: [ { id: 12, Pets: [Array] } ] }

    // without limit: 30

    // the results and query is the same the second query, (2 - populateWhere find JOINED)
  });

  test('pagination with select in strategy and populateWhere', async () => {
    const [paginationSelectIn] = await orm.em.findAndCount(
      User,
      {},
      {
        strategy: LoadStrategy.SELECT_IN,
        populate: ['pets'],
        populateWhere: {
          pets: {
            name: 'yoyo',
          },
        },
        limit: 30,
      },
    );

    // everything works as expected here
    console.log('paginationSelectIn', JSON.parse(JSON.stringify(paginationSelectIn)));
  });

});
