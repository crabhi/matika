import { Component } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0 })),
      transition(':enter', [ // fade in
        animate('500ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [ // fade out
        animate('500ms ease-out', style({ opacity: 0 }))
      ])
    ])
  ],
})
export class AppComponent {
  title = 'matika';
  numberGrid: number[][] = [
  ];
  selectedRow: number | null = null;
  selectedCol: number | null = null;
  target = 10;
  points = 0;
  enemyPos = 0;
  TILE_SIZE = 50;
  finished = false;

  constructor() {
    for (let i = 0; i < 3; i++) {
      this.numberGrid.push([]);
      for (let j = 0; j < 6; j++) {
        this.numberGrid[i].push(this.getRandomNumber(1, 9));
      }
    }
    console.log(this)
    setTimeout(() => this.moveUp(), 500)
  }

  click() {
      this.moveUp()
  }

  moveUp() {
    this.enemyPos -= 1;
    if (this.enemyPos < -this.TILE_SIZE - 1) {
      this.enemyPos = 0;
      this.numberGrid.pop();
      if (this.numberGrid.length === 0) {
        this.finished = true;
        return
      }
      console.log(this.numberGrid)
    }
    setTimeout(() => this.moveUp(), 50)
  }

  getRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  clicked(i: number, j: number) {
    if (this.selectedRow === null || this.selectedCol === null) {
      this.selectedRow = i;
      this.selectedCol = j;
    } else if (this.selectedRow === i && this.selectedCol === j) {
      this.selectedCol = this.selectedRow = null;
    } else if (this.numberGrid[this.selectedRow][this.selectedCol] + this.numberGrid[i][j] === this.target) {
        this.numberGrid[this.selectedRow][this.selectedCol] = this.getRandomNumber(1, 9);
        this.numberGrid[i][j] = this.getRandomNumber(1, 9);
        this.points += 1;
        this.selectedCol = null;
        this.selectedRow = null;
    } else {
      this.selectedRow = i;
      this.selectedCol = j;
    }
  }
}
